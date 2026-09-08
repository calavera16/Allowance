const { spawnSync } = require("node:child_process");
const path = require("node:path");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const usage = process.argv.includes("--usage");
const result = spawnSync(require("electron"), [path.join(__dirname, process.argv.includes("--security") ? "security-smoke.cjs" : usage ? "usage-smoke.cjs" : "planning-smoke.cjs"), ...process.argv.slice(2)], { env, stdio: "inherit", windowsHide: true, timeout: 90000 });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
