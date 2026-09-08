// Run the real main process and preload with synthetic collectors and private temporary storage.
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "allowance-security-smoke-"));
app.setPath("userData", path.join(temporary, "user-data"));
app.setPath("sessionData", path.join(temporary, "session-data"));
process.env.LOCALAPPDATA = temporary;
process.env.USERPROFILE = path.join(temporary, "profile");
const bin = path.join(temporary, "bin"); fs.mkdirSync(bin);
for (const name of ["codex", "claude"]) fs.writeFileSync(path.join(bin, name + ".cmd"), "@exit /b 1\r\n");
process.env.PATH = bin + path.delimiter + path.join(process.env.SystemRoot || "C:\\Windows", "System32");
delete process.env.ALLOWANCE_UPDATE_URL;
app.disableHardwareAcceleration();
process.argv.push("--built", "--hidden");
const fixture = provider => ({ provider, displayName: provider, status: "setup-required", source: "none", stale: true, windows: [], observedAt: 0 });
let hookInstalls = 0, hookRemovals = 0, dialogResponse = 0;
dialog.showMessageBox = async (_window, options) => { assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 0); return { response: dialogResponse }; };
// Keep native overlay checks hidden in the test process.
BrowserWindow.prototype.show = function () {};
BrowserWindow.prototype.showInactive = function () {};
const collectors = require.resolve("./collectors.cjs");
require.cache[collectors] = { id: collectors, filename: collectors, loaded: true, exports: {
  queryCodex: async () => fixture("codex"), queryClaude: () => fixture("claude"), claudeHookInstalled: () => false,
  stopCollectors: async () => {},
  uninstallClaudeHook: () => { hookRemovals++; return "Test removal"; },
  installClaudeHook: () => { hookInstalls++; return "Test installation"; },
} };
// Capture handler functions solely in the test process to exercise forged callers too.
const handlers = new Map(), originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, handler) => { handlers.set(name, handler); originalHandle(name, handler); };
require("./main.cjs");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error("Security smoke timed out."); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  while (BrowserWindow.getAllWindows().length < 2 || BrowserWindow.getAllWindows().some(win => win.webContents.isLoading())) await delay(50);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    assert.equal(await win.webContents.executeJavaScript("typeof require"), "undefined");
    assert.equal(await win.webContents.executeJavaScript("window.allowance.appVersion"), app.getVersion());
    assert.equal((await win.webContents.executeJavaScript("window.allowance.getUpdateState()")).status, "not-configured");
    assert.equal((await win.webContents.executeJavaScript("window.allowance.getDashboardState()")).providers.length, 2);
    assert.equal(await win.webContents.executeJavaScript("Notification.requestPermission()"), "denied");
  }
  const main = windows.find(win => !win.webContents.getURL().includes("mode="));
  const sender = main.webContents, senderFrame = sender.mainFrame;
  for (const handler of handlers.values()) {
    await assert.rejects(() => handler({ sender, senderFrame: { url: sender.getURL() } }), /not from an Allowance/);
    await assert.rejects(() => handler({ sender: {}, senderFrame }), /not from an Allowance/);
  }
  await assert.rejects(() => main.webContents.executeJavaScript("window.allowance.exportData('exe', 'data', 'payload.exe')"), /Invalid export/);
  assert.equal(await main.webContents.executeJavaScript("window.open('https://example.com') === null"), true);
  const before = sender.getURL();
  await main.webContents.executeJavaScript("location.href = 'https://example.com'; true");
  await delay(200);
  assert.equal(sender.getURL(), before);
  const networkBlocked = await main.webContents.executeJavaScript("fetch('https://example.com').then(() => false, () => true)");
  assert.equal(networkBlocked, true);
  await main.webContents.executeJavaScript("window.allowance.installClaudeHook()");
  await main.webContents.executeJavaScript("window.allowance.uninstallClaudeHook()");
  assert.equal(hookInstalls + hookRemovals, 0, "Native Cancel prevents hook mutations");
  dialogResponse = 1;
  await main.webContents.executeJavaScript("window.allowance.installClaudeHook()");
  await main.webContents.executeJavaScript("window.allowance.uninstallClaudeHook()");
  assert.equal(hookInstalls, 1); assert.equal(hookRemovals, 1);
  await main.webContents.executeJavaScript("window.allowance.setOverlayEnabled(true)");
  const overlay = BrowserWindow.getAllWindows().find(win => !windows.includes(win));
  while (overlay.webContents.isLoading()) await delay(40);
  await main.webContents.executeJavaScript("window.allowance.setOverlayPreferences({locked:false})");
  const until = Date.now() + 5000;
  while (!await overlay.webContents.executeJavaScript("Boolean(document.querySelector('.overlay-drag-handle'))")) { if (Date.now() > until) throw Error('Overlay editor did not load'); await delay(40); }
  const beforeMove = overlay.getBounds();
  await overlay.webContents.executeJavaScript("document.querySelector('.overlay-drag-handle').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true,cancelable:true}))");
  await delay(120);
  assert.equal(overlay.getBounds().x, beforeMove.x - 10, "Keyboard moves the native overlay");
  const beforeResize = overlay.getBounds();
  await overlay.webContents.executeJavaScript("document.querySelector('.overlay-resize-handle--w').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true,cancelable:true}))");
  await delay(120);
  assert.equal(overlay.getBounds().width, beforeResize.width + 10, "Keyboard resizes the native overlay");
  await main.webContents.executeJavaScript("window.allowance.setOverlayPreferences({locked:true})");
  const lockedBounds = overlay.getBounds();
  await overlay.webContents.executeJavaScript("window.allowance.moveOverlay({x:-10,y:0})");
  assert.deepEqual(overlay.getBounds(), lockedBounds, "A locked overlay cannot be moved through IPC");
  console.log(`Security smoke passed: ${handlers.size} IPC handlers reject forged senders; real windows, sandbox, permissions, navigation, CSP, exports, native hook confirmation and keyboard overlay controls verified.`);
  clearTimeout(timeout);
  app.quit();
}).catch(error => { console.error(error.message); clearTimeout(timeout); app.exit(1); });
