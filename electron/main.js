const path = require("node:path");
const electron = require("electron");
const log = require("electron-log");
const { registerIpcHandlers } = require("./services/ipc");
const { getSettingsState } = require("./services/config");
const { createMediaServer } = require("./services/mediaServer");

if (!electron || typeof electron === "string" || !electron.app) {
  throw new Error("O processo principal foi iniciado fora do Electron. Limpe ELECTRON_RUN_AS_NODE e tente novamente.");
}

const { app, BrowserWindow, shell } = electron;

let mainWindow;
let mediaServer;

async function ensureMediaServer(forceRecreate = false) {
  if (forceRecreate && mediaServer) {
    await mediaServer.close();
    mediaServer = null;
  }

  if (mediaServer) {
    return mediaServer;
  }

  mediaServer = await createMediaServer();
  return mediaServer;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers({
    ensureMediaServer,
    getMediaServer: () => mediaServer,
    recreateMediaServer: () => ensureMediaServer(true)
  });

  const settings = getSettingsState();
  if (settings.isConfigured) {
    try {
      await ensureMediaServer();
    } catch (error) {
      log.warn("Media server not initialized at startup", error.message);
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  if (mediaServer) {
    await mediaServer.close();
  }
});

process.on("uncaughtException", (error) => {
  log.error("Unhandled exception", error);
});

process.on("unhandledRejection", (error) => {
  log.error("Unhandled rejection", error);
});
