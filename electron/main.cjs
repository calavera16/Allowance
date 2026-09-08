const fs = require("node:fs");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  session,
  Tray,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const packageInfo = require("../package.json");
const { trustedSender, publicUpdateUrl, redactText, redactDetails, exportPayload } = require("./security.cjs");
const { atomicWrite } = require("./local-files.cjs");
const { hookStatus } = require("./claude-hook.cjs");
const { startProcess } = require("./processes.cjs");
const { configureLogging, logError, recentErrors } = require("./logger.cjs");
const { createTrayPng } = require("./tray-icon.cjs");
const {
  queryCodex,
  queryClaude,
  claudeHookInstalled,
  installClaudeHook,
  uninstallClaudeHook,
  stopCollectors,
} = require("./collectors.cjs");

let mainWindow = null;
let compactWindow = null;
let overlayWindow = null;
let tray = null;
let quitting = false;
let overlayEnabled = false;
let overlaySaveTimer = null;
let overlayResizeSession = null;
let overlayPreferences = {
  opacity: 0.9,
  locked: true,
  bounds: null,
};
let latestDashboard = null;
let dashboardRequest = null;
let trayState = {
  profileName: "Default",
  minimumRemaining: null,
  providers: [],
};
let updateState = {
  status: "idle",
  message: "Updates have not been checked yet.",
  version: null,
  progress: null,
};

const iconPath = path.join(__dirname, "..", "assets", "icon.ico");
const startHidden = process.argv.includes("--hidden");
const useBuiltRenderer = app.isPackaged || process.argv.includes("--built");
const rendererPath = path.join(__dirname, "..", "dist", "index.html");
const updateUrl = publicUpdateUrl(process.env.ALLOWANCE_UPDATE_URL || packageInfo.allowanceUpdateUrl);

function allowanceDataDirectory() {
  return process.platform === "win32" && process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Allowance")
    : path.join(app.getPath("userData"), "Allowance");
}

function overlayPreferencesPath() {
  return path.join(allowanceDataDirectory(), "overlay-settings.json");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function loadOverlayPreferences() {
  try {
    const value = JSON.parse(
      fs.readFileSync(overlayPreferencesPath(), "utf8"),
    );
    overlayPreferences = {
      opacity: Number.isFinite(value?.opacity)
        ? clamp(value.opacity, 0.2, 1)
        : 0.9,
      locked: value?.locked !== false,
      bounds:
        value?.bounds &&
        ["x", "y", "width", "height"].every((key) =>
          Number.isFinite(value.bounds[key]),
        )
          ? {
              x: Math.round(value.bounds.x),
              y: Math.round(value.bounds.y),
              width: clamp(Math.round(value.bounds.width), 260, 900),
              height: clamp(Math.round(value.bounds.height), 112, 600),
            }
          : null,
    };
  } catch {
    overlayPreferences = {
      opacity: 0.9,
      locked: true,
      bounds: null,
    };
  }
}

function saveOverlayPreferences() {
  fs.mkdirSync(allowanceDataDirectory(), { recursive: true });
  atomicWrite(
    overlayPreferencesPath(),
    JSON.stringify(overlayPreferences, null, 2),
    "utf8",
  );
}

function scheduleOverlayPreferencesSave() {
  clearTimeout(overlaySaveTimer);
  overlaySaveTimer = setTimeout(saveOverlayPreferences, 250);
}

function publicOverlayPreferences() {
  return {
    enabled: overlayEnabled,
    opacity: overlayPreferences.opacity,
    locked: overlayPreferences.locked,
    bounds: overlayPreferences.bounds,
  };
}

function loadRenderer(target, query = "") {
  if (useBuiltRenderer) {
    return target.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: query ? { mode: query } : {},
    });
  }
  return target.loadURL(
    `http://127.0.0.1:1420${query ? `?mode=${query}` : ""}`,
  );
}

function secureWindow(target) {
  target.webContents.on("render-process-gone", (_event, details) => logError("Renderer exited", details.reason));
  target.webContents.on("did-fail-load", (_event, code, description) => logError("Renderer load", `${code}: ${description}`));
  target.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // The app has no document-navigation or embedded-webview feature.
  for (const name of ["will-navigate", "will-frame-navigate", "will-redirect", "will-attach-webview"]) {
    target.webContents.on(name, event => event.preventDefault());
  }
}

function senderAllowed(event) {
  return trustedSender(event, [mainWindow, compactWindow, overlayWindow], useBuiltRenderer, rendererPath);
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!senderAllowed(event)) throw new Error("This request is not from an Allowance window.");
    try { return await callback(event, ...args); }
    catch (error) { logError(channel, error); throw new Error(redactText(error instanceof Error ? error.message : "The request failed.")); }
  });
}

function showWindow() {
  compactWindow?.hide();
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Allowance",
    width: 1120,
    height: 820,
    minWidth: 480,
    minHeight: 640,
    center: true,
    show: false,
    backgroundColor: "#0d1b2a",
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  secureWindow(mainWindow);
  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  loadRenderer(mainWindow);
}

function createCompactWindow() {
  compactWindow = new BrowserWindow({
    title: "Allowance quick view",
    width: 370,
    height: 430,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#0d1b2a",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  secureWindow(compactWindow);
  compactWindow.on("blur", () => compactWindow?.hide());
  compactWindow.on("closed", () => {
    compactWindow = null;
  });
  loadRenderer(compactWindow, "compact");
}

function defaultOverlayBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const work = display.workArea;
  const width = 360;
  const height = 148;
  return {
    x: work.x + work.width - width - 18,
    y: work.y + 18,
    width,
    height,
  };
}

function visibleOverlayBounds(value) {
  const candidate = value || defaultOverlayBounds();
  const width = clamp(Math.round(candidate.width), 260, 900);
  const height = clamp(Math.round(candidate.height), 112, 600);
  const display = screen.getDisplayMatching({
    x: Math.round(candidate.x),
    y: Math.round(candidate.y),
    width,
    height,
  });
  const work = display.workArea;
  return {
    x: clamp(
      Math.round(candidate.x),
      work.x,
      work.x + Math.max(0, work.width - width),
    ),
    y: clamp(
      Math.round(candidate.y),
      work.y,
      work.y + Math.max(0, work.height - height),
    ),
    width,
    height,
  };
}

function createOverlayWindow() {
  const initialBounds = visibleOverlayBounds(overlayPreferences.bounds);
  overlayWindow = new BrowserWindow({
    title: "Allowance overlay",
    ...initialBounds,
    minWidth: 260,
    minHeight: 112,
    maxWidth: 900,
    maxHeight: 600,
    show: false,
    frame: false,
    transparent: true,
    resizable: !overlayPreferences.locked,
    movable: !overlayPreferences.locked,
    maximizable: false,
    minimizable: false,
    focusable: !overlayPreferences.locked,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  secureWindow(overlayWindow);
  overlayWindow.setAlwaysOnTop(true, "floating");
  applyOverlayPreferences();
  const rememberBounds = () => {
    if (!overlayWindow || overlayPreferences.locked) return;
    overlayPreferences.bounds = overlayWindow.getBounds();
    scheduleOverlayPreferencesSave();
    broadcastOverlayPreferences();
  };
  overlayWindow.on("move", rememberBounds);
  overlayWindow.on("resize", rememberBounds);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
  overlayWindow.webContents.once("did-finish-load", () => {
    overlayWindow?.webContents.send("allowance:overlay-state", trayState);
    broadcastOverlayPreferences();
    if (overlayEnabled) {
      positionOverlayWindow();
      showOverlayWindow();
    }
  });
  loadRenderer(overlayWindow, "overlay");
}

function positionOverlayWindow() {
  if (!overlayWindow) return;
  const bounds = visibleOverlayBounds(
    overlayPreferences.bounds || overlayWindow.getBounds(),
  );
  overlayWindow.setBounds(bounds, false);
  overlayPreferences.bounds = bounds;
  scheduleOverlayPreferencesSave();
}

function showOverlayWindow() {
  if (!overlayWindow) return;
  if (overlayPreferences.locked) overlayWindow.showInactive();
  else {
    overlayWindow.show();
    overlayWindow.focus();
  }
}

function broadcastOverlayState() {
  overlayWindow?.webContents.send("allowance:overlay-state", trayState);
}

function broadcastOverlayPreferences() {
  const value = publicOverlayPreferences();
  overlayWindow?.webContents.send("allowance:overlay-preferences", value);
  mainWindow?.webContents.send("allowance:overlay-preferences", value);
  compactWindow?.webContents.send("allowance:overlay-preferences", value);
}

function applyOverlayPreferences() {
  if (!overlayWindow) return;
  const editable = !overlayPreferences.locked;
  overlayWindow.setOpacity(overlayPreferences.opacity);
  overlayWindow.setResizable(editable);
  overlayWindow.setMovable(editable);
  overlayWindow.setFocusable(editable);
  overlayWindow.setIgnoreMouseEvents(!editable, { forward: true });
}

function updateOverlayPreferences(value = {}) {
  if (Number.isFinite(value.opacity)) {
    overlayPreferences.opacity = clamp(Number(value.opacity), 0.2, 1);
  }
  if (typeof value.locked === "boolean") {
    overlayPreferences.locked = value.locked;
  }
  applyOverlayPreferences();
  scheduleOverlayPreferencesSave();
  broadcastOverlayPreferences();
  rebuildTray();
  if (overlayEnabled) showOverlayWindow();
  return publicOverlayPreferences();
}

function resetOverlayBounds() {
  overlayPreferences.bounds = null;
  if (overlayWindow) {
    overlayWindow.setBounds(defaultOverlayBounds(), false);
    overlayPreferences.bounds = overlayWindow.getBounds();
  }
  saveOverlayPreferences();
  broadcastOverlayPreferences();
  return publicOverlayPreferences();
}

function beginOverlayResize(direction, point) {
  const validDirections = new Set([
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
    "nw",
  ]);
  if (
    !overlayWindow ||
    overlayPreferences.locked ||
    !validDirections.has(direction) ||
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y)
  ) {
    return false;
  }
  overlayResizeSession = {
    direction,
    startPoint: { x: point.x, y: point.y },
    startBounds: overlayWindow.getBounds(),
  };
  return true;
}

function updateOverlayResize(point) {
  if (
    !overlayWindow ||
    !overlayResizeSession ||
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y)
  ) {
    return false;
  }
  const { direction, startPoint, startBounds } = overlayResizeSession;
  const deltaX = Math.round(point.x - startPoint.x);
  const deltaY = Math.round(point.y - startPoint.y);
  let { x, y, width, height } = startBounds;
  if (direction.includes("e")) {
    width = clamp(startBounds.width + deltaX, 260, 900);
  }
  if (direction.includes("s")) {
    height = clamp(startBounds.height + deltaY, 112, 600);
  }
  if (direction.includes("w")) {
    width = clamp(startBounds.width - deltaX, 260, 900);
    x = startBounds.x + startBounds.width - width;
  }
  if (direction.includes("n")) {
    height = clamp(startBounds.height - deltaY, 112, 600);
    y = startBounds.y + startBounds.height - height;
  }
  overlayWindow.setBounds({ x, y, width, height }, false);
  return true;
}

function endOverlayResize() {
  if (overlayWindow && overlayResizeSession) {
    overlayPreferences.bounds = overlayWindow.getBounds();
    saveOverlayPreferences();
    broadcastOverlayPreferences();
  }
  overlayResizeSession = null;
  return publicOverlayPreferences();
}

function setOverlayEnabled(enabled, notifyRenderers = false) {
  overlayEnabled = Boolean(enabled);
  if (overlayEnabled) {
    if (!overlayWindow) createOverlayWindow();
    if (overlayWindow && !overlayWindow.webContents.isLoading()) {
      positionOverlayWindow();
      showOverlayWindow();
      broadcastOverlayState();
    }
  } else {
    overlayWindow?.hide();
  }
  if (notifyRenderers) {
    mainWindow?.webContents.send(
      "allowance:overlay-toggle",
      overlayEnabled,
    );
    compactWindow?.webContents.send(
      "allowance:overlay-toggle",
      overlayEnabled,
    );
  }
  broadcastOverlayPreferences();
  rebuildTray();
  return overlayEnabled;
}

function positionCompactWindow() {
  if (!tray || !compactWindow) return;
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });
  const work = display.workArea;
  const bounds = compactWindow.getBounds();
  const x = Math.max(
    work.x + 8,
    Math.min(
      trayBounds.x - bounds.width / 2,
      work.x + work.width - bounds.width - 8,
    ),
  );
  const above = trayBounds.y - bounds.height - 8;
  const y =
    above >= work.y ? above : trayBounds.y + trayBounds.height + 8;
  compactWindow.setPosition(Math.round(x), Math.round(y), false);
}

function toggleCompactWindow() {
  if (!compactWindow) createCompactWindow();
  if (compactWindow.isVisible()) {
    compactWindow.hide();
    return;
  }
  positionCompactWindow();
  compactWindow.show();
  compactWindow.focus();
  compactWindow.webContents.send("allowance:refresh");
}

function statusTrayImage(remaining) {
  const image = nativeImage.createFromBuffer(createTrayPng(remaining, 16), {
    width: 16,
    height: 16,
    scaleFactor: 1,
  });
  image.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: createTrayPng(remaining, 32),
  });
  return image.isEmpty() ? nativeImage.createFromPath(iconPath) : image;
}

function trayPercentLabel(provider) {
  return provider.remaining === null
    ? `${provider.name}: ${provider.status === "stale" ? "needs fresh data" : "waiting"}`
    : `${provider.name}: ${Math.round(provider.remaining)}% left`;
}

function rebuildTray() {
  if (!tray) return;
  tray.setImage(statusTrayImage(trayState.minimumRemaining));
  const minimum = trayState.minimumRemaining;
  tray.setToolTip(
    minimum === null
      ? `Allowance — ${trayState.profileName} — waiting for usage`
      : `Allowance — ${trayState.profileName} — ${Math.round(minimum)}% minimum remaining`,
  );
  const providerItems = trayState.providers.map((provider) => ({
    label: trayPercentLabel(provider),
    enabled: false,
  }));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open dashboard", click: showWindow },
      { label: `Profile: ${trayState.profileName}`, enabled: false },
      ...providerItems,
      { type: "separator" },
      { label: "Refresh now", click: broadcastRefresh },
      {
        label: "Always-on-top overlay",
        type: "checkbox",
        checked: overlayEnabled,
        click: (item) => setOverlayEnabled(item.checked, true),
      },
      {
        label: overlayPreferences.locked
          ? "Edit overlay position and size"
          : "Finish editing overlay",
        enabled: overlayEnabled,
        click: () =>
          updateOverlayPreferences({
            locked: !overlayPreferences.locked,
          }),
      },
      {
        label: `Overlay opacity: ${Math.round(overlayPreferences.opacity * 100)}%`,
        enabled: false,
      },
      {
        label: "Reset overlay position and size",
        enabled: overlayEnabled,
        click: resetOverlayBounds,
      },
      {
        label: "Launch at startup",
        type: "checkbox",
        checked: getStartupEnabled(),
        click: (item) => setStartupEnabled(item.checked),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray() {
  tray = new Tray(statusTrayImage(null));
  rebuildTray();
  tray.on("click", toggleCompactWindow);
}

function broadcastRefresh() {
  mainWindow?.webContents.send("allowance:refresh");
  compactWindow?.webContents.send("allowance:refresh");
}

function getStartupEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}

function setStartupEnabled(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath,
    args: app.isPackaged ? ["--hidden"] : [],
  });
  rebuildTray();
  return getStartupEnabled();
}

function commandVersion(command) {
  return new Promise(resolve => {
    const managed = startProcess(process.platform === "win32" ? "cmd.exe" : command,
      process.platform === "win32" ? ["/d", "/s", "/c", `${command} --version`] : ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "", settled = false;
    const finish = installed => {
      if (settled) return; settled = true; clearTimeout(timer);
      void managed.stop().finally(() => resolve({ installed, version: installed ? redactText(output.trim().split(/\r?\n/)[0]).slice(0, 160) || "Installed" : null }));
    };
    const timer = setTimeout(() => finish(false), 5000);
    managed.child.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 4096) finish(false); });
    managed.child.once("error", () => finish(false));
    managed.child.once("close", code => finish(code === 0));
  });
}

async function getDiagnostics() {
  const [codexCommand, claudeCommand] = await Promise.all([
    commandVersion("codex"),
    commandVersion("claude"),
  ]);
  const hook = hookStatus();
  const hookInstalled = hook.installed;
  const codexProvider = latestDashboard?.providers?.find(
    (item) => item.provider === "codex",
  );
  const claudeProvider = latestDashboard?.providers?.find(
    (item) => item.provider === "claude",
  );
  const items = [
    {
      id: "codex-cli",
      label: "Codex CLI",
      status: codexCommand.installed ? "ok" : "error",
      summary: codexCommand.installed
        ? codexCommand.version
        : "Not found on PATH",
      detail:
        codexProvider?.error ||
        (codexProvider?.windows?.length
          ? "Usage connection is working."
          : "Open Codex and sign in."),
    },
    {
      id: "claude-cli",
      label: "Claude Code",
      status: claudeCommand.installed ? "ok" : "warning",
      summary: claudeCommand.installed
        ? claudeCommand.version
        : "Not found on PATH",
      detail: claudeCommand.installed
        ? "Claude Code is available."
        : "Install Claude Code to track its allowance.",
    },
    {
      id: "claude-hook",
      label: "Claude local hook",
      status: hookInstalled
        ? claudeProvider?.windows?.length
          ? "ok"
          : "warning"
        : "warning",
      summary: hook.error ? "Settings need repair" : hookInstalled
        ? claudeProvider?.windows?.length
          ? "Installed and reporting"
          : "Installed; waiting for a session"
        : "Not installed",
      detail: hook.error || (hookInstalled
        ? "Start or resume Claude Code if no data appears."
        : "Install it from Setup or Settings."),
    },
    {
      id: "storage",
      label: "Private storage",
      status: "ok",
      summary: "Local and per Windows user",
      detail:
        "No prompts, transcripts, source code, or service credentials are stored.",
    },
    {
      id: "startup",
      label: "Windows startup",
      status: getStartupEnabled() ? "ok" : "info",
      summary: getStartupEnabled() ? "Enabled" : "Disabled",
      detail: "Allowance can start hidden in the tray after sign-in.",
    },
    {
      id: "updates",
      label: "Automatic updates",
      status: updateUrl && app.isPackaged ? "ok" : "info",
      summary:
        updateUrl && app.isPackaged
          ? "Release channel configured"
          : "Release channel not configured",
      detail: updateUrl
        ? updateState.message
        : "The publisher must provide ALLOWANCE_UPDATE_URL when creating release builds.",
    },
  ];
  return {
    checkedAt: Math.floor(Date.now() / 1_000),
    appVersion: app.getVersion(),
    platform: `${process.platform} ${process.getSystemVersion()}`,
    architecture: process.arch,
    packaged: app.isPackaged,
    dataDirectory:
      process.platform === "win32"
        ? "%LOCALAPPDATA%\\Allowance"
        : "Application user data/Allowance",
    items,
    recentErrors: recentErrors(),
  };
}

function emitUpdateState(next) {
  updateState = { ...updateState, ...redactDetails(next) };
  for (const target of [mainWindow, compactWindow]) {
    target?.webContents.send("allowance:update-state", updateState);
  }
}

function configureUpdater() {
  if (!app.isPackaged || !updateUrl) {
    emitUpdateState({
      status: "not-configured",
      message: app.isPackaged
        ? "No release channel is configured for this build."
        : "Update checks are available in packaged builds.",
    });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({ provider: "generic", url: updateUrl });
  autoUpdater.on("checking-for-update", () =>
    emitUpdateState({
      status: "checking",
      message: "Checking for updates…",
      progress: null,
    }),
  );
  autoUpdater.on("update-available", (info) =>
    emitUpdateState({
      status: "available",
      message: `Allowance ${info.version} is available and downloading.`,
      version: info.version,
    }),
  );
  autoUpdater.on("update-not-available", () =>
    emitUpdateState({
      status: "current",
      message: "Allowance is up to date.",
      version: app.getVersion(),
      progress: null,
    }),
  );
  autoUpdater.on("download-progress", (progress) =>
    emitUpdateState({
      status: "downloading",
      message: `Downloading update — ${Math.round(progress.percent)}%`,
      progress: progress.percent,
    }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    emitUpdateState({
      status: "downloaded",
      message: `Allowance ${info.version} is ready to install.`,
      version: info.version,
      progress: 100,
    }),
  );
  autoUpdater.on("error", (error) =>
    emitUpdateState({
      status: "error",
      message: `Update check failed: ${error.message}`,
      progress: null,
    }),
  );
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 15_000);
  setInterval(
    () => autoUpdater.checkForUpdates().catch(() => {}),
    6 * 60 * 60 * 1_000,
  );
}

function registerIpc() {
  ipcMain.on("allowance:get-app-version", (event) => {
    event.returnValue = senderAllowed(event) ? app.getVersion() : "";
  });
  handle("allowance:get-dashboard-state", () => {
    // Broadcast the completed snapshot to each window; never request a second collection.
    if (dashboardRequest) return dashboardRequest;
    dashboardRequest = (async () => {
      const [codex, claude] = await Promise.all([
        queryCodex(),
        Promise.resolve(queryClaude(allowanceDataDirectory())),
      ]);
      latestDashboard = {
        providers: redactDetails([codex, claude]),
        refreshedAt: Math.floor(Date.now() / 1_000),
        claudeHookInstalled: claudeHookInstalled(),
        claudeHookCommand: null,
      };
      for (const target of [mainWindow, compactWindow]) target?.webContents.send("allowance:dashboard-state", latestDashboard);
      return latestDashboard;
    })().finally(() => { dashboardRequest = null; });
    return dashboardRequest;
  });
  handle("allowance:get-diagnostics", async () => redactDetails(await getDiagnostics()));
  handle("allowance:install-claude-hook", async event => {
    const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
      type: "question", title: "Connect Claude Code", message: "Install the Allowance status-line hook?",
      detail: "This updates Claude's status-line setting and creates a local settings backup. Other Claude settings are preserved.",
      buttons: ["Cancel", "Install hook"], defaultId: 0, cancelId: 0,
    });
    return result.response === 1 ? redactText(installClaudeHook()) : "Hook installation canceled.";
  });
  handle("allowance:uninstall-claude-hook", async event => {
    const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
      type: "question", title: "Disconnect Claude Code", message: "Remove the Allowance status-line hook?",
      detail: "Claude quota collection will stop. Your other Claude settings and local settings backups will be preserved.",
      buttons: ["Cancel", "Remove hook"], defaultId: 0, cancelId: 0,
    });
    return result.response === 1 ? redactText(uninstallClaudeHook()) : "Hook removal canceled.";
  });
  handle("allowance:notify", (_event, payload) => {
    const title = String(payload?.title || "Allowance").slice(0, 120);
    const body = String(payload?.body || "").slice(0, 500);
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: iconPath }).show();
    }
  });
  handle("allowance:get-startup", getStartupEnabled);
  handle("allowance:set-startup", (_event, enabled) =>
    setStartupEnabled(enabled),
  );
  handle("allowance:export-data", async (event, payload) => {
    const { kind, content, safeName } = exportPayload(payload);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(owner || undefined, {
      title:
        kind === "csv"
          ? "Export Allowance history"
          : "Back up Allowance",
      defaultPath: path.join(app.getPath("documents"), safeName),
      filters:
        kind === "csv"
          ? [{ name: "CSV files", extensions: ["csv"] }]
          : [{ name: "JSON files", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, content, "utf8");
    return { canceled: false, filePath: result.filePath };
  });
  handle("allowance:import-data", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: "Restore an Allowance backup",
      properties: ["openFile"],
      filters: [
        { name: "Allowance JSON backup", extensions: ["json"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }
    const filePath = result.filePaths[0];
    const stats = fs.statSync(filePath);
    if (stats.size > 64 * 1024 * 1024) {
      throw new Error("Backup is larger than 64 MB");
    }
    return {
      canceled: false,
      filePath,
      content: fs.readFileSync(filePath, "utf8"),
    };
  });
  handle("allowance:copy-text", (_event, value) =>
    clipboard.writeText(redactText(value)),
  );
  handle("allowance:get-update-state", () => updateState);
  handle("allowance:check-updates", async () => {
    if (!app.isPackaged || !updateUrl) return updateState;
    emitUpdateState({
      status: "checking",
      message: "Checking for updates…",
      progress: null,
    });
    await autoUpdater.checkForUpdates();
    return updateState;
  });
  handle("allowance:install-update", () => {
    if (updateState.status === "downloaded") {
      autoUpdater.quitAndInstall(false, true);
    }
  });
  handle("allowance:set-tray-state", (_event, value) => {
    trayState = {
      profileName: String(value?.profileName || "Default").slice(0, 40),
      companion: ["cat", "robot", "plant", "custom"].includes(value?.companion) ? value.companion : "none",
      customCompanion: typeof value?.customCompanion?.id === "string" && /^[a-f0-9]{64}$/.test(value.customCompanion.id)
        ? { id: value.customCompanion.id, name: String(value.customCompanion.name || "Custom GIF").slice(0, 100),
          width: clamp(Number(value.customCompanion.width) || 1, 1, 2048), height: clamp(Number(value.customCompanion.height) || 1, 1, 2048),
          bytes: clamp(Number(value.customCompanion.bytes) || 0, 0, 20 * 1024 * 1024) } : null,
      companionSize: Number.isFinite(value?.companionSize) ? clamp(value.companionSize, 40, 96) : 64,
      companionAnimated: value?.companionAnimated !== false,
      lastResetAt: Number.isFinite(value?.lastResetAt) ? Math.max(0, Math.min(Date.now() / 1000, value.lastResetAt)) : 0,
      minimumLabel: String(value?.minimumLabel || "Minimum remaining").slice(0, 100),
      minimumRemaining: Number.isFinite(value?.minimumRemaining)
        ? Math.max(0, Math.min(100, value.minimumRemaining))
        : null,
      providers: Array.isArray(value?.providers)
        ? value.providers.slice(0, 4).map((provider) => ({
            name: String(provider?.name || "Provider").slice(0, 30),
            remaining: Number.isFinite(provider?.remaining)
              ? Math.max(0, Math.min(100, provider.remaining))
              : null,
            status: String(provider?.status || "unknown").slice(0, 30),
          }))
        : [],
    };
    rebuildTray();
    broadcastOverlayState();
  });
  handle("allowance:get-overlay-state", () => trayState);
  handle(
    "allowance:get-overlay-preferences",
    publicOverlayPreferences,
  );
  handle("allowance:set-overlay-enabled", (_event, enabled) =>
    setOverlayEnabled(enabled),
  );
  handle("allowance:set-overlay-preferences", (_event, value) =>
    updateOverlayPreferences(value),
  );
  handle("allowance:reset-overlay-bounds", resetOverlayBounds);
  handle(
    "allowance:begin-overlay-resize",
    (_event, direction, point) => beginOverlayResize(direction, point),
  );
  handle("allowance:update-overlay-resize", (_event, point) =>
    updateOverlayResize(point),
  );
  handle("allowance:end-overlay-resize", endOverlayResize);
  handle("allowance:move-overlay", (_event, delta) => {
    if (!overlayWindow || overlayPreferences.locked || !Number.isFinite(delta?.x) || !Number.isFinite(delta?.y)) return publicOverlayPreferences();
    const bounds = overlayWindow.getBounds();
    overlayWindow.setBounds(visibleOverlayBounds({ ...bounds, x: bounds.x + clamp(Math.round(delta.x), -40, 40), y: bounds.y + clamp(Math.round(delta.y), -40, 40) }));
    overlayPreferences.bounds = overlayWindow.getBounds(); scheduleOverlayPreferencesSave(); broadcastOverlayPreferences();
    return publicOverlayPreferences();
  });
  handle("allowance:open-dashboard", showWindow);
  handle("allowance:close-compact", () =>
    compactWindow?.hide(),
  );
}

const removingHook = process.argv.includes("--remove-claude-hook");
if (removingHook) {
  try { uninstallClaudeHook(); app.exit(0); } catch { app.exit(1); }
}
const hasLock = !removingHook && app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.whenReady().then(() => {
    app.setAppUserModelId("com.usagetracker.allowance");
    configureLogging(allowanceDataDirectory());
    process.on("uncaughtExceptionMonitor", error => logError("Uncaught exception", error));
    process.on("unhandledRejection", error => logError("Unhandled rejection", error));
    app.on("child-process-gone", (_event, details) => logError("Child process exited", details.reason));
    loadOverlayPreferences();
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on("will-download", event => event.preventDefault());
    registerIpc();
    createWindow();
    createCompactWindow();
    createTray();
    screen.on("display-metrics-changed", () => {
      if (overlayEnabled) positionOverlayWindow();
    });
    configureUpdater();
  });
  let shutdown = null, shutdownComplete = false;
  app.on("before-quit", event => {
    quitting = true;
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdown) return;
    clearTimeout(overlaySaveTimer);
    try { saveOverlayPreferences(); } catch (error) { logError("Overlay settings", error); }
    shutdown = stopCollectors().finally(() => { shutdownComplete = true; app.quit(); });
  });
  app.on("activate", () => {
    if (!mainWindow) createWindow();
    showWindow();
  });
}
