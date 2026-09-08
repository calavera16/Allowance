// Exercises production preload + renderer with isolated IPC fixtures, never real collectors.
const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "allowance-usage-smoke-")));
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
const epoch = Math.floor(Date.now() / 1000);
const provider = (id, used, at = epoch) => ({ provider: id, displayName: id === "codex" ? "Codex" : "Claude",
  status: "connected", source: id === "codex" ? "codex-app-server" : "claude-status-line", observedAt: at, stale: false,
  windows: [{ id: id + ":week", label: "7-day", usedPercent: used, remainingPercent: 100 - used, resetsAt: epoch + 86400 * 5, windowMinutes: 10080 }] });
let snapshot = { refreshedAt: epoch, claudeHookInstalled: true, providers: [provider("codex", 70), provider("claude", 99, epoch - 3600)] };
snapshot.providers[0].windows.unshift({ id: "codex:short", label: "5-hour", usedPercent: 20, remainingPercent: 80, resetsAt: epoch + 600, windowMinutes: 300 });
let refreshError = false, exportError = true, tray = null, notifications = [], exportPayload = null, compactClosed = 0;
let refreshGate = null, refreshCalls = 0, importPayload = null;
const errors = [], windows = [];
const preferences = { enabled: false, locked: true, opacity: 0.9, bounds: null };
const update = { status: "not-configured", message: "No test release channel." };
ipcMain.on("allowance:get-app-version", event => { event.returnValue = "smoke"; });
const handlers = {
  "get-dashboard-state": async () => {
    refreshCalls++;
    if (refreshGate) await refreshGate;
    await new Promise(resolve => setTimeout(resolve, 80));
    if (refreshError) throw new Error("Collector temporarily unavailable");
    return snapshot;
  },
  "get-diagnostics": () => ({ checkedAt: epoch, appVersion: "smoke", platform: "win32", architecture: "x64", packaged: false, dataDirectory: "isolated", items: [
    { id: "codex", label: "Codex", status: "ok", summary: "Local CLI is available and signed in." },
    { id: "claude", label: "Claude Code", status: "warning", summary: "Waiting for a recent usage snapshot.", detail: "Start or resume a Claude Code session to refresh usage." },
    { id: "storage", label: "Local storage", status: "ok", summary: "Profiles and history are stored on this device." },
  ] }),
  "import-data": () => importPayload || { canceled: true },
  "get-startup": () => false,
  "get-update-state": () => update,
  "check-updates": () => update,
  "get-overlay-preferences": () => preferences,
  "set-overlay-enabled": () => false,
  "set-tray-state": (_event, value) => { tray = value; },
  "notify": (_event, value) => { notifications.push(value); },
  "export-data": (_event, value) => {
    if (exportError) throw new Error("Export location unavailable");
    exportPayload = value;
    return { canceled: false, filePath: "isolated-export.csv" };
  },
  "close-compact": () => { compactClosed++; },
  "open-dashboard": () => {},
};
for (const [name, handler] of Object.entries(handlers)) ipcMain.handle("allowance:" + name, handler);
async function evaluate(win, code) {
  try { return await win.webContents.executeJavaScript(code, true); }
  catch (cause) { throw new Error(`${cause.message}\nExpression: ${code}\nRenderer: ${errors.join("\n")}`); }
}
async function waitFor(win, code) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (await evaluate(win, code)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error("Timed out: " + code + "\n" + await evaluate(win, "document.body.innerText.slice(-2500)"));
}
async function open(mode) {
  const win = new BrowserWindow({ width: mode ? 370 : 1280, height: mode ? 430 : 1000, frame: !mode, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  windows.push(win);
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  await win.loadFile(path.join(__dirname, "../dist/index.html"), mode ? { query: { mode } } : undefined);
  return win;
}
async function button(win, text) {
  await waitFor(win, `[...(document.querySelector('[role=dialog]') || document).querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled && b.offsetParent !== null)`);
  await evaluate(win, `(() => { const b = [...(document.querySelector('[role=dialog]') || document).querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw Error('Missing button'); b.click(); })()`);
}
async function input(win, selector, value) {
  await evaluate(win, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function screenshot(win, name) {
  const output = path.join(__dirname, "../release/smoke");
  fs.mkdirSync(output, { recursive: true });
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await new Promise(resolve => setTimeout(resolve, 150));
  fs.writeFileSync(path.join(output, name), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
}
app.whenReady().then(async () => {
  const main = await open();
  await waitFor(main, "document.querySelector('.hero h1')?.textContent.includes('30%')");
  await waitFor(main, "document.querySelector('img.wizard-mark')?.naturalWidth > 0");
  assert.ok(await evaluate(main, "document.querySelector('.wizard').contains(document.activeElement)"), "First-run setup keeps keyboard focus inside");
  await screenshot(main, "polish-setup.png");
  await button(main, "Continue");
  await waitFor(main, "document.querySelector('.wizard .diagnostic-list')");
  await screenshot(main, "polish-connections.png");
  await button(main, "Continue");
  await button(main, "Open dashboard");
  await waitFor(main, "!document.querySelector('.wizard') && document.querySelector('.hero h1')?.textContent.includes('30%')");
  assert.ok(await evaluate(main, "document.querySelector('img.brand__mark').naturalWidth > 0"), "Dashboard logo loads in a file-based Electron window");
  assert.ok(await evaluate(main, "!document.querySelector('.profile-select')"), "A single profile does not offer an empty switcher");
  assert.match(await evaluate(main, "document.querySelector('.hero__copy').textContent"), /Codex 7-day resets in [45]d/);
  assert.equal(tray.minimumRemaining, 30);
  assert.equal(tray.providers.find(p => p.name === "Claude").remaining, null);
  assert.equal(tray.providers.find(p => p.name === "Claude").status, "stale");
  assert.ok(notifications.every(item => !item.title.includes("Claude")), "Stale low balances cannot fire usage alerts");
  assert.ok(await evaluate(main, "JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].history.every(p => p.claude === undefined)"));
  await screenshot(main, "design-dashboard.png");

  await evaluate(main, "document.querySelector('[aria-label=Settings]').focus(); document.querySelector('[aria-label=Settings]').click()");
  await waitFor(main, "document.activeElement?.getAttribute('aria-label') === 'Close settings'");
  assert.equal(await evaluate(main, "getComputedStyle([...document.querySelectorAll('.settings-nav button')].find(b => !b.classList.contains('active'))).backgroundColor"), "rgba(0, 0, 0, 0)", "Settings navigation retains the flat surface");
  await screenshot(main, "design-settings.png");
  await evaluate(main, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))");
  assert.ok(await evaluate(main, "document.querySelector('.settings-modal').contains(document.activeElement) && document.activeElement.getAttribute('aria-label') !== 'Close settings'"), "Shift-Tab wraps inside Settings");
  await button(main, "Data");
  await button(main, "Export CSV");
  await waitFor(main, "document.querySelector('.settings-content [role=alert]')?.textContent.includes('Export location unavailable')");
  exportError = false;
  await button(main, "Export CSV");
  await waitFor(main, "document.querySelector('.settings-content [role=status]')?.textContent.includes('CSV saved')");
  assert.equal(exportPayload.kind, "csv");
  assert.match(exportPayload.content, /codex_remaining/);
  await evaluate(main, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
  await waitFor(main, "!document.querySelector('.settings-modal') && document.activeElement?.getAttribute('aria-label') === 'Settings'");

  // Real profile forms must work in Electron without unsupported browser prompts.
  await evaluate(main, "document.querySelector('[aria-label=Settings]').click()");
  await button(main, "Profiles");
  await button(main, "New profile");
  await waitFor(main, "document.activeElement?.id === 'profile-name'");
  await button(main, "Create profile");
  await waitFor(main, "document.querySelector('#profile-name-error')?.textContent.includes('Enter a profile name')");
  await input(main, "#profile-name", "Default");
  await button(main, "Create profile");
  await waitFor(main, "document.querySelector('#profile-name-error')?.textContent.includes('already uses that name')");
  await input(main, "#profile-name", "Work");
  await button(main, "Create profile");
  await waitFor(main, "document.querySelectorAll('.profile-select option').length === 2 && document.querySelector('.profile-list__row.active strong')?.textContent === 'Work'");
  await button(main, "Rename profile");
  await input(main, "#profile-name", "Research and writing");
  await button(main, "Save name");
  await waitFor(main, "document.querySelector('.profile-select option:checked')?.textContent === 'Research and writing'");
  await button(main, "New profile");
  await evaluate(main, "document.querySelector('#profile-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
  await waitFor(main, "!document.querySelector('.profile-editor') && document.querySelector('.settings-modal') && document.activeElement?.textContent === 'New profile'");
  assert.equal(await evaluate(main, "JSON.parse(localStorage.getItem('allowance.data.v2')).profiles.length"), 2);
  await screenshot(main, "polish-profiles.png");
  await evaluate(main, "document.querySelector('[aria-label=\"Switch to Default\"]').click()");
  await waitFor(main, "document.querySelector('.profile-list__row.active strong')?.textContent === 'Default'");
  await evaluate(main, "document.querySelector('[aria-label=\"Switch to Research and writing\"]').click()");
  await button(main, "Delete profile");
  await button(main, "Cancel");
  assert.equal(await evaluate(main, "JSON.parse(localStorage.getItem('allowance.data.v2')).profiles.length"), 2, "Cancel preserves the profile and history");
  await button(main, "Delete profile");
  await button(main, "Delete permanently");
  await waitFor(main, "!document.querySelector('.profile-select') && document.querySelector('.profile-list__row.active strong')?.textContent === 'Default'");
  assert.equal(await evaluate(main, "JSON.parse(localStorage.getItem('allowance.data.v2')).profiles.length"), 1);
  for (const tab of ["General", "Connections", "Planning", "Companion", "Alerts", "Data", "Health", "Updates"]) {
    await button(main, tab);
    await screenshot(main, `polish-settings-${tab.toLowerCase()}.png`);
  }
  main.setSize(800, 640);
  await button(main, "General");
  await screenshot(main, "polish-settings-small.png");
  assert.ok(await evaluate(main, "(() => { const r = document.querySelector('.settings-modal').getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; })()"), "Settings fits the minimum native window size");
  assert.ok(await evaluate(main, "(() => { const b = document.querySelector('.modal-backdrop'); return b.scrollWidth <= b.clientWidth && b.scrollHeight <= b.clientHeight; })()"), "Dialog padding does not add a second pair of scrollbars");
  await button(main, "Profiles");
  await button(main, "New profile");
  await input(main, "#profile-name", "Small screen profile");
  await button(main, "Create profile");
  await evaluate(main, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor(main, "!document.querySelector('.settings-modal')");
  assert.ok(await evaluate(main, "document.documentElement.scrollWidth <= innerWidth"), "Dashboard header fits with multiple profiles");
  // Starting a session during an in-flight background refresh must not drop the action.
  const callsBeforeSession = refreshCalls;
  let releaseRefresh;
  refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
  await evaluate(main, "document.querySelector('[aria-label=\"Refresh usage\"]').click()");
  await waitFor(main, "document.querySelector('[aria-label=\"Refresh usage\"]').disabled");
  await button(main, "Start coding");
  await waitFor(main, "document.querySelector('.session-bar button').disabled");
  assert.equal(refreshCalls, callsBeforeSession + 2, "The session action requests a snapshot even while refresh is pending");
  refreshGate = null; releaseRefresh();
  await waitFor(main, "(() => { const d = JSON.parse(localStorage.getItem('allowance.data.v2')); return Boolean(d.profiles.find(p => p.id === d.activeProfileId).insights.active); })()");
  assert.ok(await evaluate(main, "document.querySelector('.profile-select select')?.disabled"));
  await evaluate(main, "document.querySelector('[aria-label=Settings]').click()");
  await button(main, "Profiles");
  await waitFor(main, "document.querySelector('.profile-actions')");
  assert.ok(await evaluate(main, "['New profile', 'Delete profile'].every(label => [...document.querySelectorAll('.profile-actions button')].find(b => b.textContent === label)?.disabled)"), "Active sessions protect profile history from switching or deletion");
  await evaluate(main, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await button(main, "Finish session");
  await waitFor(main, "!document.querySelector('.profile-select select')?.disabled");
  main.setSize(480, 800);
  await evaluate(main, "document.querySelector('[aria-label=Settings]').click()");
  await button(main, "General");
  await screenshot(main, "polish-settings-narrow.png");
  assert.ok(await evaluate(main, "(() => { const b = document.querySelector('.modal-backdrop'); return b.scrollWidth <= b.clientWidth && b.scrollHeight <= b.clientHeight; })()"));
  await evaluate(main, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  main.setSize(1120, 820);
  await evaluate(main, "document.querySelector('[aria-label=\"Dismiss message\"]')?.click()");
  assert.notEqual(await evaluate(main, "getComputedStyle(document.querySelector('.session-bar button')).backgroundColor"), "rgba(0, 0, 0, 0)", "The primary session action has a visible contrasting fill");
  await screenshot(main, "review-overview-default.png");
  assert.ok(await evaluate(main, "document.querySelector('.session-bar button').getBoundingClientRect().bottom <= innerHeight"), "Core quotas and session action fit the default window");
  main.setSize(1280, 1000);

  const compact = await open("compact");
  await waitFor(compact, "document.querySelector('.compact-summary strong')?.textContent === '30%'");
  assert.match(await evaluate(compact, "document.querySelector('.compact-providers').textContent"), /Last known: 1%.*Stale/);
  assert.ok(await evaluate(compact, "document.documentElement.scrollWidth <= innerWidth"), "Popup has no horizontal overflow");
  assert.ok(await evaluate(compact, "document.querySelector('.compact-open').getBoundingClientRect().bottom <= innerHeight"), "Dashboard shortcut fits the native popup without scrolling");
  refreshError = true;
  await evaluate(compact, "document.querySelector('[aria-label=\"Refresh usage\"]').click()");
  await waitFor(compact, "document.querySelector('[role=alert]')?.textContent.includes('Collector temporarily unavailable')");
  assert.match(await evaluate(compact, "document.querySelector('.compact-summary').textContent"), /Waiting for fresh usage/);
  assert.ok(await evaluate(compact, "!document.querySelector('[aria-label=\"Refresh usage\"]').disabled"), "Refresh can be retried after failure");
  refreshError = false;
  snapshot = { ...snapshot, providers: [provider("codex", 20), provider("claude", 10)] };
  compact.webContents.send("allowance:dashboard-state", snapshot);
  await waitFor(compact, "document.querySelector('.compact-summary strong')?.textContent === '80%' && !document.querySelector('[role=alert]')");
  await evaluate(compact, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(compactClosed, 1);
  assert.deepEqual(errors, [], "No unhandled renderer errors");
  const output = path.join(__dirname, "../release/smoke");
  fs.mkdirSync(output, { recursive: true });
  await compact.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await new Promise(resolve => setTimeout(resolve, 150));
  fs.writeFileSync(path.join(output, "usage-compact.png"), (await compact.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  snapshot = { refreshedAt: epoch, claudeHookInstalled: true, providers: [
    { provider: "codex", displayName: "Codex", status: "missing", source: "none", windows: [], error: "Sign in to Codex, then refresh to see your allowance." },
    { provider: "claude", displayName: "Claude", status: "missing", source: "none", windows: [] },
  ] };
  await evaluate(main, "document.querySelector('[aria-label=\"Refresh usage\"]').click()");
  await waitFor(main, "document.querySelectorAll('.empty-provider').length === 2");
  assert.match(await evaluate(main, "document.querySelector('.provider-card--claude').textContent"), /Waiting for Claude Code/);
  assert.ok(await evaluate(main, "[...document.querySelectorAll('.session-bar button')].some(b => b.textContent === 'Start coding' && b.disabled)"));
  await screenshot(main, "polish-empty.png");
  // Damage discovered through a storage event must never trigger an autosave over the original.
  const savedBeforeDamage = await evaluate(main, "localStorage.getItem('allowance.data.v2')");
  await evaluate(main, "localStorage.setItem('allowance.data.v2.previous', localStorage.getItem('allowance.data.v2')); localStorage.setItem('allowance.data.v2', '{damaged'); window.dispatchEvent(new StorageEvent('storage', {key:'allowance.data.v2'}))");
  await waitFor(main, "document.querySelector('.storage-notice')?.textContent.includes('needs repair')");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await evaluate(main, "localStorage.getItem('allowance.data.v2')"), "{damaged");
  main.reload();
  await waitFor(main, "document.querySelector('.storage-notice')?.textContent.includes('needs repair') && !document.querySelector('.wizard')");
  await screenshot(main, "review-storage-recovery.png");
  assert.equal(await evaluate(main, "localStorage.getItem('allowance.data.v2')"), "{damaged");
  await button(main, "Use recovery copy");
  await waitFor(main, "document.querySelector('.storage-notice')?.textContent.includes('Recovery copy restored')");
  assert.equal(await evaluate(main, "localStorage.getItem('allowance.data.v2.recovery')"), "{damaged");
  assert.equal(await evaluate(main, "JSON.parse(localStorage.getItem('allowance.data.v2')).profiles.length"), JSON.parse(savedBeforeDamage).profiles.length);
  const restore = JSON.parse(savedBeforeDamage); restore.profiles[0].name = "Restored workspace";
  importPayload = { canceled: false, content: JSON.stringify({ format: "allowance-backup", version: 2, data: restore }) };
  await evaluate(main, "document.querySelector('[aria-label=Settings]').click()");
  await button(main, "Data"); await button(main, "Import");
  await waitFor(main, "document.querySelector('.confirmation-dialog')");
  assert.equal(await evaluate(main, "document.activeElement?.textContent"), "Cancel");
  await button(main, "Cancel");
  assert.notEqual(await evaluate(main, "JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].name"), "Restored workspace");
  await evaluate(main, "document.querySelector('[aria-label=Settings]').click()");
  await button(main, "Data"); await button(main, "Import");
  await button(main, "Restore backup");
  await waitFor(main, "!document.querySelector('.confirmation-dialog') && JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].name === 'Restored workspace'");
  assert.deepEqual(errors, [], "Recovery and restore have no unhandled renderer errors");
  console.log("Usage UI smoke passed: setup/logo loading, profile create/rename/switch/delete validation and session guards, fresh totals/reset pairing, stale alerts/history, Settings keyboard focus/layout and export recovery, compact freshness/errors/live updates, session/refresh concurrency, recovery across events/restarts, and cancellable backup restore.");
  windows.forEach(win => win.destroy()); app.exit(0);
}).catch(error => { console.error(error); windows.forEach(win => win.destroy()); app.exit(1); });
