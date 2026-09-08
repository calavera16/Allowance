const fs = require("node:fs");
const path = require("node:path");
const { redactText } = require("./security.cjs");
let directory = null;
const recent = [];
function configureLogging(dataDirectory) { directory = path.join(dataDirectory, "logs"); }
function logError(area, error) {
  const line = `${new Date().toISOString()} ${area}: ${redactText(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, " ").slice(0, 2000)}`;
  recent.push(line); if (recent.length > 20) recent.shift();
  if (!directory) return;
  try {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "allowance.log");
    if (fs.existsSync(file) && fs.statSync(file).size > 256 * 1024) {
      fs.rmSync(path.join(directory, "allowance.previous.log"), { force: true });
      fs.renameSync(file, path.join(directory, "allowance.previous.log"));
    }
    fs.appendFileSync(file, line + "\n", { encoding: "utf8", mode: 0o600 });
  } catch { /* A diagnostic write must never break collection or shutdown. */ }
}
module.exports = { configureLogging, logError, recentErrors: () => [...recent] };
