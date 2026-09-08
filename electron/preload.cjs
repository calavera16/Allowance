const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("allowance", {
  getDashboardState: () => ipcRenderer.invoke("allowance:get-dashboard-state"),
  getDiagnostics: () => ipcRenderer.invoke("allowance:get-diagnostics"),
  uninstallClaudeHook: () => ipcRenderer.invoke("allowance:uninstall-claude-hook"),
  installClaudeHook: () => ipcRenderer.invoke("allowance:install-claude-hook"),
  notify: (title, body) => ipcRenderer.invoke("allowance:notify", { title, body }),
  getStartupEnabled: () => ipcRenderer.invoke("allowance:get-startup"),
  setStartupEnabled: (enabled) => ipcRenderer.invoke("allowance:set-startup", enabled),
  exportData: (kind, content, suggestedName) =>
    ipcRenderer.invoke("allowance:export-data", { kind, content, suggestedName }),
  importData: () => ipcRenderer.invoke("allowance:import-data"),
  copyText: (text) => ipcRenderer.invoke("allowance:copy-text", text),
  checkForUpdates: () => ipcRenderer.invoke("allowance:check-updates"),
  installUpdate: () => ipcRenderer.invoke("allowance:install-update"),
  getUpdateState: () => ipcRenderer.invoke("allowance:get-update-state"),
  setTrayState: (state) => ipcRenderer.invoke("allowance:set-tray-state", state),
  getOverlayState: () => ipcRenderer.invoke("allowance:get-overlay-state"),
  getOverlayPreferences: () =>
    ipcRenderer.invoke("allowance:get-overlay-preferences"),
  setOverlayEnabled: (enabled) =>
    ipcRenderer.invoke("allowance:set-overlay-enabled", enabled),
  setOverlayPreferences: (preferences) =>
    ipcRenderer.invoke("allowance:set-overlay-preferences", preferences),
  resetOverlayBounds: () =>
    ipcRenderer.invoke("allowance:reset-overlay-bounds"),
  beginOverlayResize: (direction, point) =>
    ipcRenderer.invoke(
      "allowance:begin-overlay-resize",
      direction,
      point,
    ),
  updateOverlayResize: (point) =>
    ipcRenderer.invoke("allowance:update-overlay-resize", point),
  moveOverlay: (delta) => ipcRenderer.invoke("allowance:move-overlay", delta),
  endOverlayResize: () =>
    ipcRenderer.invoke("allowance:end-overlay-resize"),
  openDashboard: () => ipcRenderer.invoke("allowance:open-dashboard"),
  closeCompact: () => ipcRenderer.invoke("allowance:close-compact"),
  onRefresh: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("allowance:refresh", listener);
    return () => ipcRenderer.removeListener("allowance:refresh", listener);
  },
  onDashboardState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("allowance:dashboard-state", listener);
    return () => ipcRenderer.removeListener("allowance:dashboard-state", listener);
  },
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("allowance:update-state", listener);
    return () => ipcRenderer.removeListener("allowance:update-state", listener);
  },
  onOverlayState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("allowance:overlay-state", listener);
    return () => ipcRenderer.removeListener("allowance:overlay-state", listener);
  },
  onOverlayPreferences: (callback) => {
    const listener = (_event, preferences) => callback(preferences);
    ipcRenderer.on("allowance:overlay-preferences", listener);
    return () =>
      ipcRenderer.removeListener("allowance:overlay-preferences", listener);
  },
  onOverlayToggle: (callback) => {
    const listener = (_event, enabled) => callback(enabled);
    ipcRenderer.on("allowance:overlay-toggle", listener);
    return () => ipcRenderer.removeListener("allowance:overlay-toggle", listener);
  },
  platform: process.platform,
  appVersion: ipcRenderer.sendSync("allowance:get-app-version"),
});
