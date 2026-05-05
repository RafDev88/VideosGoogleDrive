const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const ENV_PATH = path.join(process.cwd(), ".env");

const SETTING_FIELDS = [
  { key: "TMDB_API_TOKEN", required: false, secret: true, label: "Token TMDb" },
  { key: "GOOGLE_DRIVE_CLIENT_ID", required: true, secret: false, label: "Client ID" },
  { key: "GOOGLE_DRIVE_CLIENT_SECRET", required: true, secret: true, label: "Client Secret" },
  { key: "GOOGLE_DRIVE_REFRESH_TOKEN", required: true, secret: true, label: "Refresh Token" },
  { key: "GOOGLE_DRIVE_FOLDER_ID", required: true, secret: false, label: "Folder ID" },
  { key: "GOOGLE_DRIVE_SHARED_DRIVE_ID", required: false, secret: false, label: "Shared Drive ID" },
  { key: "GOOGLE_DRIVE_RECURSIVE", required: false, secret: false, label: "Importar subpastas", fallback: "true" },
  { key: "APP_MEDIA_PORT", required: false, secret: false, label: "Porta local do player", fallback: "3867" },
  { key: "APP_ENABLE_TRANSCODE", required: false, secret: false, label: "Ativar FFmpeg para MKV/AVI", fallback: "true" },
  { key: "FFMPEG_PATH", required: false, secret: false, label: "Caminho do FFmpeg" }
];

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }

  const raw = fs.readFileSync(ENV_PATH, "utf8");
  return dotenv.parse(raw);
}

function syncProcessEnv(values) {
  for (const field of SETTING_FIELDS) {
    const value = values[field.key];
    if (value === undefined || value === null || value === "") {
      delete process.env[field.key];
      continue;
    }
    process.env[field.key] = String(value);
  }
}

function getSettingsState() {
  const parsed = readEnvFile();

  const values = {};
  const fields = SETTING_FIELDS.map((field) => {
    const value = parsed[field.key] ?? field.fallback ?? "";
    values[field.key] = value;

    return {
      ...field,
      value,
      filled: Boolean(value)
    };
  });

  const missingRequired = fields.filter((field) => field.required && !field.value).map((field) => field.key);

  return {
    envPath: ENV_PATH,
    values,
    fields,
    isConfigured: missingRequired.length === 0,
    missingRequired
  };
}

function getRequiredEnv(values, name) {
  const value = values[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

function buildAppConfigFromValues(values) {
  return {
    tmdbApiToken: values.TMDB_API_TOKEN || "",
    driveClientId: getRequiredEnv(values, "GOOGLE_DRIVE_CLIENT_ID"),
    driveClientSecret: getRequiredEnv(values, "GOOGLE_DRIVE_CLIENT_SECRET"),
    driveRefreshToken: getRequiredEnv(values, "GOOGLE_DRIVE_REFRESH_TOKEN"),
    driveFolderId: getRequiredEnv(values, "GOOGLE_DRIVE_FOLDER_ID"),
    driveSharedDriveId: values.GOOGLE_DRIVE_SHARED_DRIVE_ID || "",
    driveRecursive: String(values.GOOGLE_DRIVE_RECURSIVE || "true").toLowerCase() !== "false",
    mediaPort: Number(values.APP_MEDIA_PORT || "3867"),
    enableTranscode: String(values.APP_ENABLE_TRANSCODE || "true").toLowerCase() !== "false",
    ffmpegPath: values.FFMPEG_PATH || ""
  };
}

function loadAppConfig() {
  const state = getSettingsState();
  syncProcessEnv(state.values);
  return buildAppConfigFromValues(state.values);
}

function saveAppSettings(inputValues) {
  const state = getSettingsState();
  const nextValues = {};

  for (const field of SETTING_FIELDS) {
    const incoming = inputValues[field.key];
    const finalValue =
      incoming !== undefined
        ? String(incoming).trim()
        : state.values[field.key] ?? field.fallback ?? "";

    nextValues[field.key] = finalValue;
  }

  const lines = SETTING_FIELDS.map((field) => `${field.key}=${nextValues[field.key] ?? ""}`);
  fs.writeFileSync(ENV_PATH, `${lines.join("\n")}\n`, "utf8");
  syncProcessEnv(nextValues);

  return getSettingsState();
}

module.exports = {
  ENV_PATH,
  SETTING_FIELDS,
  getSettingsState,
  loadAppConfig,
  buildAppConfigFromValues,
  saveAppSettings
};
