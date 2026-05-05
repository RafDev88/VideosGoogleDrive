const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { shell, ipcMain } = require("electron");
const { createTmdbService } = require("./tmdbService");
const { createDriveService } = require("./driveService");
const { getSettingsState, saveAppSettings } = require("./config");
const { probeFfmpeg } = require("./ffmpegService");
const { exchangeGoogleCodeForTokens, generateGoogleAuthUrl } = require("./googleOAuthService");
const {
  getLibraryState,
  getCachedMetadata,
  getCachedMetadataByKey,
  saveCachedMetadata,
  toggleFavorite,
  updatePlayback
} = require("./libraryStateService");

function mergeLibraryItem(file, metadata, mediaServer) {
  const transcodeReady = Boolean(file.canTranscode && mediaServer.ffmpegAvailable);
  const playbackPath = transcodeReady ? "transcode" : "stream";

  return {
    ...file,
    transcodeReady,
    playbackUrl: `http://127.0.0.1:${mediaServer.port}/${playbackPath}/${file.id}`,
    metadata
  };
}

function buildFallbackMetadata(file, reason = "fallback") {
  return {
    id: null,
    mediaType: file.mediaType,
    title: file.parsedTitle || file.name,
    originalTitle: "",
    overview:
      reason === "no-token"
        ? "Configure o TMDb para baixar capas, sinopses e lancamento automaticamente."
        : "Titulo ainda nao reconhecido automaticamente pelo TMDb.",
    posterUrl: "",
    backdropUrl: "",
    releaseDate: file.year ? `${file.year}-01-01` : "",
    voteAverage: 0,
    matched: false,
    matchReason: reason
  };
}

function spawnDetached(command, args = [], options = {}) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    ...options
  });
  child.unref();
}

function openInExternalPlayer(url) {
  const candidates = [
    { name: "VLC", command: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" },
    { name: "VLC", command: "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe" },
    { name: "MPC-HC", command: "C:\\Program Files\\MPC-HC\\mpc-hc64.exe" },
    { name: "MPC-HC", command: "C:\\Program Files (x86)\\MPC-HC\\mpc-hc.exe" },
    { name: "MPC-BE", command: "C:\\Program Files\\MPC-BE x64\\mpc-be64.exe" },
    { name: "MPC-BE", command: "C:\\Program Files (x86)\\MPC-BE\\mpc-be.exe" },
    { name: "PotPlayer", command: "C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe" },
    { name: "PotPlayer", command: "C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe" },
    { name: "mpv", command: "mpv.exe", shell: true },
    { name: "VLC", command: "vlc.exe", shell: true }
  ];

  for (const candidate of candidates) {
    try {
      if (!candidate.shell && !fs.existsSync(candidate.command)) {
        continue;
      }

      spawnDetached(candidate.command, [url], candidate.shell ? { shell: true } : {});
      return candidate.name;
    } catch {
      continue;
    }
  }

  return null;
}

function registerIpcHandlers({ ensureMediaServer, getMediaServer, recreateMediaServer }) {
  let cachedLibrary = null;
  let cachedTmdbToken = "";
  let cachedTmdbService = null;

  async function getTmdbService() {
    const mediaServer = await ensureMediaServer();
    const token = mediaServer.driveService.config.tmdbApiToken;

    if (!token) {
      return null;
    }

    if (cachedTmdbService && cachedTmdbToken === token) {
      return cachedTmdbService;
    }

    cachedTmdbToken = token;
    cachedTmdbService = await createTmdbService(token);
    return cachedTmdbService;
  }

  async function loadLibrary(forceRefresh = false) {
    if (!forceRefresh && cachedLibrary) {
      return cachedLibrary;
    }

    const mediaServer = await ensureMediaServer();
    const { driveService } = mediaServer;
    const files = await driveService.listVideoFiles();
    const tmdbService = await getTmdbService();

    const library = await Promise.all(
      files.map(async (file) => {
        let metadata = null;

        const cachedMetadata = getCachedMetadata(file.id);
        if (cachedMetadata) {
          return mergeLibraryItem(file, cachedMetadata, mediaServer);
        }

        const cachedMetadataByKey = getCachedMetadataByKey({
          title: file.parsedTitle,
          mediaType: file.mediaType,
          year: file.year
        });
        if (cachedMetadataByKey) {
          saveCachedMetadata(file.id, cachedMetadataByKey, {
            title: file.parsedTitle,
            mediaType: file.mediaType,
            year: file.year
          });
          return mergeLibraryItem(file, cachedMetadataByKey, mediaServer);
        }

        try {
          metadata = tmdbService
            ? await tmdbService.searchByTitle(file.parsedTitle, file.mediaType, {
                year: file.year
              })
            : buildFallbackMetadata(file, "no-token");

          if (!metadata) {
            metadata = buildFallbackMetadata(file, "not-found");
          } else {
            metadata = {
              ...metadata,
              matched: true,
              matchReason: "tmdb"
            };
            saveCachedMetadata(file.id, metadata, {
              title: file.parsedTitle,
              mediaType: file.mediaType,
              year: file.year
            });
          }
        } catch (error) {
          metadata = buildFallbackMetadata(file, "error");
        }

        return mergeLibraryItem(file, metadata, mediaServer);
      })
    );

    cachedLibrary = library;
    return library;
  }

  ipcMain.handle("app:get-config", async () => {
    const settings = getSettingsState();
    return {
      mediaPort: getMediaServer()?.port || null,
      configured: settings.isConfigured,
      missingRequired: settings.missingRequired,
      envPath: settings.envPath
    };
  });

  ipcMain.handle("app:get-settings", async () => {
    return getSettingsState();
  });

  ipcMain.handle("app:save-settings", async (_event, payload) => {
    const settings = saveAppSettings(payload);
    cachedLibrary = null;
    cachedTmdbService = null;
    cachedTmdbToken = "";

    if (settings.isConfigured) {
      await recreateMediaServer();
    }

    return settings;
  });

  ipcMain.handle("app:test-settings", async (_event, payload) => {
    const result = {
      tmdb: { ok: false, message: "Nao testado" },
      drive: { ok: false, message: "Nao testado" },
      ffmpeg: { ok: false, message: "Nao testado" }
    };

    try {
      if (!payload.TMDB_API_TOKEN) {
        result.tmdb = { ok: false, message: "TMDb opcional: sem token, o app carrega os videos sem capas e sinopses." };
      } else {
        const tmdbService = await createTmdbService(payload.TMDB_API_TOKEN);
        await tmdbService.searchByTitle("Interestelar", "movie", { year: 2014 });
        result.tmdb = { ok: true, message: "Token TMDb valido." };
      }
    } catch (error) {
      result.tmdb = { ok: false, message: error.message };
    }

    try {
      const driveService = await createDriveService(payload);
      const probe = await driveService.probeFolder();
      const examples = probe.sampleVideos.length ? ` Exemplos: ${probe.sampleVideos.join(", ")}.` : "";
      result.drive = {
        ok: true,
        message: `Pasta "${probe.folder.name || "Sem nome"}" conectada. ${probe.totalVideos} video(s) encontrado(s).${examples}`,
        details: probe
      };
    } catch (error) {
      result.drive = { ok: false, message: error.message };
    }

    try {
      const ffmpeg = probeFfmpeg({
        enableTranscode: String(payload.APP_ENABLE_TRANSCODE || "true").toLowerCase() !== "false",
        ffmpegPath: payload.FFMPEG_PATH || ""
      });

      result.ffmpeg = {
        ok: ffmpeg.available,
        message: ffmpeg.available
          ? `FFmpeg encontrado em ${ffmpeg.command}. MKV/AVI podem ser transcodificados no app.`
          : ffmpeg.reason || "FFmpeg nao encontrado.",
        details: ffmpeg
      };
    } catch (error) {
      result.ffmpeg = { ok: false, message: error.message };
    }

    return result;
  });

  ipcMain.handle("google-oauth:get-auth-url", async (_event, payload) => {
    return {
      authUrl: generateGoogleAuthUrl(payload.clientId, payload.clientSecret)
    };
  });

  ipcMain.handle("google-oauth:exchange-code", async (_event, payload) => {
    return exchangeGoogleCodeForTokens(payload.clientId, payload.clientSecret, payload.code);
  });

  ipcMain.handle("library:list", async () => loadLibrary(false));
  ipcMain.handle("library:refresh", async () => loadLibrary(true));
  ipcMain.handle("library-state:get", async () => getLibraryState());
  ipcMain.handle("library-state:playback", async (_event, payload) => updatePlayback(payload.fileId, payload));
  ipcMain.handle("library-state:toggle-favorite", async (_event, fileId) => toggleFavorite(fileId));

  ipcMain.handle("tmdb:search", async (_event, payload) => {
    const tmdbService = await getTmdbService();
    return tmdbService.searchByTitle(payload.title, payload.mediaType);
  });

  ipcMain.handle("metadata:save", async (_event, payload) => {
    const savedMetadata = saveCachedMetadata(payload.fileId, payload.metadata, payload.key);

    if (cachedLibrary) {
      cachedLibrary = cachedLibrary.map((item) =>
        item.id === payload.fileId
          ? { ...item, metadata: savedMetadata }
          : item
      );
    }

    return savedMetadata;
  });

  ipcMain.handle("player:get-url", async (_event, fileId) => {
    const mediaServer = await ensureMediaServer();
    return `http://127.0.0.1:${mediaServer.port}/stream/${fileId}`;
  });

  ipcMain.handle("app:open-external", async (_event, url) => {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("player:open-external", async (_event, payload) => {
    const playerName = openInExternalPlayer(payload.url);
    if (!playerName) {
      throw new Error("Nenhum player externo compativel foi encontrado. Instale VLC, mpv, MPC-HC, MPC-BE ou PotPlayer.");
    }

    return {
      ok: true,
      playerName
    };
  });
}

module.exports = {
  registerIpcHandlers
};
