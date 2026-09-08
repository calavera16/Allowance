const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const active = new Set();

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, { ...options, detached: process.platform !== "win32", windowsHide: true });
  let stopping = null;
  const entry = {
    child,
    stop() {
      if (stopping) return stopping;
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
      stopping = new Promise(resolve => {
        if (process.platform === "win32") {
          execFile(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"),
            ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 4000 }, () => resolve());
        } else {
          try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ }
          resolve();
        }
      }).finally(() => active.delete(entry));
      return stopping;
    },
  };
  active.add(entry);
  child.once("error", () => active.delete(entry));
  child.once("close", () => { if (!stopping) active.delete(entry); });
  return entry;
}

async function stopProcesses() { await Promise.all([...active].map(entry => entry.stop())); }
module.exports = { startProcess, stopProcesses, activeProcessCount: () => active.size };
