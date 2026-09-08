const { contextBridge, ipcRenderer } = require("electron");
const snapshot = { profileName: "Overlay test", minimumRemaining: 72, companion: "cat", lastResetAt: 0,
  providers: [{ name: "Codex", remaining: 72, status: "connected" }, { name: "Claude", remaining: 82, status: "connected" }] };
contextBridge.exposeInMainWorld("allowance", {
  getOverlayState: async () => snapshot,
  getOverlayPreferences: async () => ({ enabled: true, locked: true, opacity: 0.9, bounds: null }),
  onOverlayState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on("smoke:overlay", listener); return () => ipcRenderer.removeListener("smoke:overlay", listener); },
  onOverlayPreferences: callback => { const listener = (_event, preferences) => callback(preferences); ipcRenderer.on("smoke:overlay-preferences", listener); return () => ipcRenderer.removeListener("smoke:overlay-preferences", listener); },
});
