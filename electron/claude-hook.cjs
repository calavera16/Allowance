const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { atomicWrite } = require("./local-files.cjs");

const defaultDirectory = () => path.join(os.homedir(), ".claude");
const commandFor = directory => `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(directory, "allowance-statusline.ps1")}"`;
function ownsHook(settings, directory) {
  return settings?.statusLine?.type === "command" && typeof settings.statusLine.command === "string" &&
    settings.statusLine.command.trim().toLowerCase() === commandFor(directory).toLowerCase();
}
function readSettings(directory) {
  const file = path.join(directory, "settings.json");
  if (!fs.existsSync(file)) return { settings: {}, raw: null };
  if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error("Claude settings exceed 4 MB. Review the settings file before changing the hook.");
  const raw = fs.readFileSync(file, "utf8");
  try {
    const settings = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error();
    return { settings, raw };
  } catch { throw new Error("Claude settings.json is invalid. Allowance has left it unchanged. Repair the JSON in Claude's settings directory, then retry."); }
}
function hookStatus(directory = defaultDirectory()) {
  try { return { installed: ownsHook(readSettings(directory).settings, directory), error: null }; }
  catch (error) { return { installed: false, error: error.message }; }
}
function installHook(script, directory = defaultDirectory()) {
  const { settings, raw } = readSettings(directory);
  if (settings.statusLine && !ownsHook(settings, directory)) throw new Error("Claude already has a custom status line. Keep it or remove it in Claude before installing the Allowance hook.");
  fs.mkdirSync(directory, { recursive: true });
  if (raw !== null) {
    const original = path.join(directory, "settings.json.allowance.backup");
    if (!fs.existsSync(original)) atomicWrite(original, raw);
    atomicWrite(path.join(directory, "settings.json.allowance.latest.backup"), raw);
  }
  const scriptPath = path.join(directory, "allowance-statusline.ps1");
  const previousScript = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, "utf8") : null;
  if (previousScript !== null && !ownsHook(settings, directory) && !previousScript.includes("# Managed by Allowance")) {
    throw new Error("A different allowance-statusline.ps1 file already exists. Review it in Claude's settings directory before installing.");
  }
  atomicWrite(scriptPath, script);
  try {
    // Abort if another tool updated settings while the hook was being prepared.
    const current = readSettings(directory).raw;
    if (current !== raw) throw new Error("Claude settings changed during installation. Retry after the other settings edit completes.");
    settings.statusLine = { type: "command", command: commandFor(directory), refreshInterval: 30 };
    atomicWrite(path.join(directory, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
  } catch (error) {
    if (previousScript !== null) atomicWrite(scriptPath, previousScript);
    else fs.rmSync(scriptPath, { force: true });
    throw error;
  }
  return "Claude hook installed. Start or resume Claude Code to receive usage.";
}
function uninstallHook(directory = defaultDirectory()) {
  const { settings, raw } = readSettings(directory);
  if (!ownsHook(settings, directory)) return "Claude's current status line is not managed by Allowance. No settings were changed.";
  // Never restore a whole old backup over settings the user edited since installation.
  if (raw !== null) atomicWrite(path.join(directory, "settings.json.allowance.latest.backup"), raw);
  delete settings.statusLine;
  if (readSettings(directory).raw !== raw) throw new Error("Claude settings changed during removal. Retry after the other settings edit completes.");
  atomicWrite(path.join(directory, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
  const script = path.join(directory, "allowance-statusline.ps1");
  if (fs.existsSync(script) && fs.readFileSync(script, "utf8").startsWith("# Managed by Allowance")) fs.rmSync(script);
  return "Claude hook removed. Your other Claude settings and local settings backups were preserved.";
}
module.exports = { hookStatus, installHook, uninstallHook, ownsHook, readSettings };
