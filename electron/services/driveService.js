const path = require("node:path");
const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");
const { buildAppConfigFromValues, loadAppConfig } = require("./config");
const { parseMediaFilename } = require("./mediaParser");

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".m4v",
  ".webm"
]);
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const EXTENSION_METADATA = {
  ".mp4": { mimeType: "video/mp4", playableInApp: true, canTranscode: false },
  ".m4v": { mimeType: "video/mp4", playableInApp: true, canTranscode: false },
  ".webm": { mimeType: "video/webm", playableInApp: true, canTranscode: false },
  ".mov": { mimeType: "video/quicktime", playableInApp: true, canTranscode: false },
  ".mkv": { mimeType: "video/x-matroska", playableInApp: false, canTranscode: true },
  ".avi": { mimeType: "video/x-msvideo", playableInApp: false, canTranscode: true }
};

function normalizeDriveFolderId(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }

  const folderMatch = value.match(/\/folders\/([^/?]+)/i);
  if (folderMatch) {
    return folderMatch[1];
  }

  const idMatch = value.match(/[?&]id=([^&]+)/i);
  if (idMatch) {
    return idMatch[1];
  }

  return value;
}

function buildDriveErrorMessage(error) {
  const status = error?.response?.status;
  if (status === 401) {
    return "Google Drive recusou a autenticacao. Gere um novo refresh token e teste novamente.";
  }
  if (status === 403) {
    return "O app nao tem permissao para acessar essa pasta do Google Drive.";
  }
  if (status === 404) {
    return "A pasta do Google Drive nao foi encontrada. Confira a URL ou o Folder ID.";
  }

  return error?.message || "Falha ao acessar o Google Drive.";
}

function buildAuthClient(config) {
  const client = new OAuth2Client(
    config.driveClientId,
    config.driveClientSecret,
    "http://localhost"
  );

  client.setCredentials({
    refresh_token: config.driveRefreshToken
  });

  return client;
}

async function createDriveService(configOverride = null) {
  const config = configOverride ? buildAppConfigFromValues(configOverride) : loadAppConfig();
  config.driveFolderId = normalizeDriveFolderId(config.driveFolderId);
  const auth = buildAuthClient(config);
  const drive = google.drive({ version: "v3", auth });

  async function listChildren(parentId, pageSize = 200) {
    const files = [];
    let pageToken = undefined;

    do {
      const params = {
        q: `'${parentId}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size,thumbnailLink,createdTime,modifiedTime,webViewLink)",
        orderBy: "name_natural",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize,
        pageToken
      };

      if (config.driveSharedDriveId) {
        params.corpora = "drive";
        params.driveId = config.driveSharedDriveId;
      }

      const response = await drive.files.list(params);
      files.push(...(response.data.files || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return files;
  }

  function mapVideoFile(file, folderPath = "") {
    const parsed = parseMediaFilename(file.name || "");
    const extension = path.extname(file.name || "").toLowerCase();
    const extensionMeta = EXTENSION_METADATA[extension] || {
      mimeType: file.mimeType || "application/octet-stream",
      playableInApp: false,
      canTranscode: false
    };

    return {
      id: file.id,
      name: file.name,
      mimeType: extensionMeta.mimeType || file.mimeType || "application/octet-stream",
      extension,
      playableInApp: extensionMeta.playableInApp,
      canTranscode: extensionMeta.canTranscode,
      playbackIssue: extensionMeta.playableInApp
        ? ""
        : "Esse formato nao e compativel com o player interno do Electron. Prefira arquivos MP4, M4V ou WebM.",
      size: Number(file.size || 0),
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      thumbnail: file.thumbnailLink || "",
      webViewLink: file.webViewLink || "",
      parsedTitle: parsed.title,
      mediaType: parsed.mediaType,
      year: parsed.year,
      season: parsed.season,
      episode: parsed.episode,
      seriesKey: parsed.seriesKey,
      folderPath
    };
  }

  async function getFolder(folderId) {
    try {
      const response = await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType,webViewLink,driveId",
        supportsAllDrives: true
      });

      return response.data;
    } catch (error) {
      throw new Error(buildDriveErrorMessage(error));
    }
  }

  async function listVideoFilesRecursive(rootFolderId) {
    const queue = [{ id: rootFolderId, path: "" }];
    const videos = [];

    while (queue.length > 0) {
      const current = queue.shift();
      const files = await listChildren(current.id);

      for (const file of files) {
        if (file.mimeType === FOLDER_MIME_TYPE) {
          queue.push({
            id: file.id,
            path: current.path ? `${current.path}/${file.name}` : file.name
          });
          continue;
        }

        if (VIDEO_EXTENSIONS.has(path.extname(file.name || "").toLowerCase())) {
          videos.push(mapVideoFile(file, current.path));
        }
      }
    }

    return videos;
  }

  async function getAccessToken() {
    const tokenResponse = await auth.getAccessToken();
    if (!tokenResponse || !tokenResponse.token) {
      throw new Error("Nao foi possivel obter access token do Google Drive.");
    }
    return tokenResponse.token;
  }

  async function listVideoFiles() {
    try {
      if (config.driveRecursive) {
        return await listVideoFilesRecursive(config.driveFolderId);
      }

      const files = await listChildren(config.driveFolderId);

      return files
        .filter((file) => VIDEO_EXTENSIONS.has(path.extname(file.name || "").toLowerCase()))
        .map((file) => mapVideoFile(file, ""));
    } catch (error) {
      throw new Error(buildDriveErrorMessage(error));
    }
  }

  async function probeFolder() {
    try {
      const folder = await getFolder(config.driveFolderId);
      const files = await listChildren(config.driveFolderId, 12);
      const videos = files.filter((file) => VIDEO_EXTENSIONS.has(path.extname(file.name || "").toLowerCase()));
      const folders = files.filter((file) => file.mimeType === FOLDER_MIME_TYPE);

      let totalVideos = videos.length;
      if (config.driveRecursive) {
        totalVideos = (await listVideoFilesRecursive(config.driveFolderId)).length;
      }

      return {
        folder: {
          id: folder.id,
          name: folder.name || "",
          webViewLink: folder.webViewLink || "",
          driveId: folder.driveId || ""
        },
        recursive: Boolean(config.driveRecursive),
        totalItems: files.length,
        totalVideos,
        directFolders: folders.length,
        sampleVideos: videos.slice(0, 5).map((file) => file.name)
      };
    } catch (error) {
      throw new Error(buildDriveErrorMessage(error));
    }
  }

  return {
    listVideoFiles,
    getFolder,
    probeFolder,
    getAccessToken,
    config
  };
}

module.exports = {
  createDriveService,
  normalizeDriveFolderId
};
