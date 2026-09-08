const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { hookStatus, installHook, uninstallHook } = require("./claude-hook.cjs");
const script = "# Managed by Allowance\n'quota fixture'\n";
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "allowance-hook-lifecycle-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
test("hook update and removal preserve newer user settings and current backups", t => {
  const dir = fixture(t), file = path.join(dir, "settings.json");
  fs.writeFileSync(file, JSON.stringify({ theme: "dark", permissions: { allow: ["fixture"] } }));
  installHook(script, dir);
  assert.equal(hookStatus(dir).installed, true);
  const settings = JSON.parse(fs.readFileSync(file)); settings.theme = "light";
  fs.writeFileSync(file, JSON.stringify(settings));
  installHook(script + "# updated\n", dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "settings.json.allowance.latest.backup"))).theme, "light");
  uninstallHook(dir);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { theme: "light", permissions: { allow: ["fixture"] } });
  assert.equal(fs.existsSync(path.join(dir, "allowance-statusline.ps1")), false);
  assert.equal(hookStatus(dir).installed, false);
  assert.doesNotThrow(() => uninstallHook(dir));
});
test("hook removal cannot overwrite a replacement status line", t => {
  const dir = fixture(t), file = path.join(dir, "settings.json"); installHook(script, dir);
  const settings = JSON.parse(fs.readFileSync(file)); settings.statusLine.command = "different-tool allowance-statusline.ps1";
  fs.writeFileSync(file, JSON.stringify(settings)); const before = fs.readFileSync(file);
  assert.equal(hookStatus(dir).installed, false);
  assert.throws(() => installHook(script, dir), /custom status line/);
  uninstallHook(dir);
  assert.deepEqual(fs.readFileSync(file), before);
});
test("malformed Claude settings remain byte-for-byte intact and diagnostics explain repair", t => {
  const dir = fixture(t), file = path.join(dir, "settings.json");
  for (const raw of ["invalid JSON", "[]", "null"]) {
    fs.writeFileSync(file, raw);
    assert.match(hookStatus(dir).error, /Repair the JSON/);
    assert.throws(() => installHook(script, dir), /left it unchanged/);
    assert.throws(() => uninstallHook(dir), /left it unchanged/);
    assert.equal(fs.readFileSync(file, "utf8"), raw);
  }
});
test("hook writes leave no temporary files behind", t => {
  const dir = fixture(t); installHook(script, dir); uninstallHook(dir);
  assert.equal(fs.readdirSync(dir).some(file => file.endsWith(".tmp")), false);
});
