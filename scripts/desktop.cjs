const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
// Only the explicit local launcher reads .env. Packaged apps never ship it.
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [root, ...process.argv.slice(2)], { cwd: root, env, stdio: "inherit", windowsHide: true });
child.on("error", () => { console.error("Could not start Electron."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
