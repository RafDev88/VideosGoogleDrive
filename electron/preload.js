const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mediaApp", {
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  getSettings: () => ipcRenderer.invoke("app:get-settings"),
  saveSettings: (payload) => ipcRenderer.invoke("app:save-settings", payload),
  testSettings: (payload) => ipcRenderer.invoke("app:test-settings", payload),
  generateGoogleAuthUrl: (payload) => ipcRenderer.invoke("google-oauth:get-auth-url", payload),
  exchangeGoogleCode: (payload) => ipcRenderer.invoke("google-oauth:exchange-code", payload),
  getLibraryState: () => ipcRenderer.invoke("library-state:get"),
  savePlaybackProgress: (payload) => ipcRenderer.invoke("library-state:playback", payload),
  toggleFavorite: (fileId) => ipcRenderer.invoke("library-state:toggle-favorite", fileId),
  listLibrary: () => ipcRenderer.invoke("library:list"),
  refreshLibrary: () => ipcRenderer.invoke("library:refresh"),
  searchMetadata: (payload) => ipcRenderer.invoke("tmdb:search", payload),
  saveMetadata: (payload) => ipcRenderer.invoke("metadata:save", payload),
  getPlaybackUrl: (fileId) => ipcRenderer.invoke("player:get-url", fileId),
  openInExternalPlayer: (payload) => ipcRenderer.invoke("player:open-external", payload),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url)
});
