const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

function ensureStorageDir() {
  const dir = path.join(app.getPath("userData"), "state");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getStatePath() {
  return path.join(ensureStorageDir(), "library-state.json");
}

function readState() {
  const statePath = getStatePath();
  if (!fs.existsSync(statePath)) {
    return { playback: {}, favorites: [], recent: [], seriesProgress: {}, metadataCache: {} };
  }

  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      playback: parsed.playback || {},
      favorites: parsed.favorites || [],
      recent: parsed.recent || [],
      seriesProgress: parsed.seriesProgress || {},
      metadataCache: parsed.metadataCache || {}
    };
  } catch {
    return { playback: {}, favorites: [], recent: [], seriesProgress: {}, metadataCache: {} };
  }
}

function writeState(state) {
  fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf8");
  return state;
}

function normalizeMetadataKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildMetadataKey(input) {
  const title = normalizeMetadataKey(input?.title || "");
  const mediaType = normalizeMetadataKey(input?.mediaType || "");
  const year = String(input?.year || "").trim();

  return [title, mediaType, year].filter(Boolean).join("__");
}

function getLibraryState() {
  return readState();
}

function updatePlayback(fileId, payload) {
  const state = readState();
  state.playback[fileId] = {
    position: Number(payload.position || 0),
    duration: Number(payload.duration || 0),
    updatedAt: new Date().toISOString()
  };

  state.recent = [fileId, ...state.recent.filter((id) => id !== fileId)].slice(0, 40);

  if (payload.seriesKey) {
    state.seriesProgress[payload.seriesKey] = {
      fileId,
      title: payload.title || "",
      season: Number(payload.season || 1),
      episode: Number(payload.episode || 0),
      finished: Boolean(payload.finished),
      updatedAt: new Date().toISOString()
    };
  }

  return writeState(state);
}

function toggleFavorite(fileId) {
  const state = readState();
  const exists = state.favorites.includes(fileId);
  state.favorites = exists
    ? state.favorites.filter((id) => id !== fileId)
    : [fileId, ...state.favorites];

  writeState(state);
  return {
    favorites: state.favorites,
    isFavorite: !exists
  };
}

function getCachedMetadata(fileId) {
  const state = readState();
  return state.metadataCache[fileId] || null;
}

function getCachedMetadataByKey(keyInput) {
  const state = readState();
  const key = buildMetadataKey(keyInput);
  if (!key) {
    return null;
  }

  return state.metadataCache[key] || null;
}

function saveCachedMetadata(fileId, metadata, keyInput = null) {
  const state = readState();
  const payload = {
    ...metadata,
    cachedAt: new Date().toISOString()
  };
  state.metadataCache[fileId] = payload;

  const key = buildMetadataKey(keyInput);
  if (key) {
    state.metadataCache[key] = payload;
  }

  writeState(state);
  return payload;
}

module.exports = {
  buildMetadataKey,
  getLibraryState,
  getCachedMetadata,
  getCachedMetadataByKey,
  saveCachedMetadata,
  updatePlayback,
  toggleFavorite
};
