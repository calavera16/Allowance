const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { startProcess, stopProcesses, activeProcessCount } = require("./processes.cjs");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
test("cleanup reaps a real shell and its child process tree", { timeout: 15000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allowance-process-tree-"));
  const parent = path.join(dir, "parent.cjs"), pidFile = path.join(dir, "pids.json");
  fs.writeFileSync(parent, `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});fs.writeFileSync(process.argv[2],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`);
  const managed = process.platform === "win32"
    ? startProcess(`"${process.execPath}" "${parent}" "${pidFile}"`, [], { shell: true, stdio: "ignore" })
    : startProcess(process.execPath, [parent, pidFile], { stdio: "ignore" });
  t.after(async () => { await managed.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  for (let tries = 0; tries < 100 && !fs.existsSync(pidFile); tries++) await delay(30);
  assert.equal(fs.existsSync(pidFile), true, "Fixture child tree started");
  const pids = JSON.parse(fs.readFileSync(pidFile)); assert.ok(pids.every(alive));
  await stopProcesses(); await delay(150);
  assert.ok(pids.every(pid => !alive(pid)), "All child processes exited");
  assert.equal(activeProcessCount(), 0);
  await managed.stop();
});
