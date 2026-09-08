const test = require("node:test");
const assert = require("node:assert/strict");
const { scanText, sourceAllowed } = require("../scripts/release-audit.cjs");

test("source export excludes local secrets, data, artifacts and Git metadata", () => {
  for (const file of [".env", ".env.local", ".env.production", "signing.pfx", "src/credentials.json", "release/app.exe", "node_modules/module/index.js", ".git/config", "claude-status.json", "allowance-backup.json", "notes.txt", "assets/platform-icons/icon.png"]) assert.equal(sourceAllowed(file), false, file);
  for (const file of [".env.example", "src/App.tsx", "electron/main.cjs", "assets/icon.png", "package-lock.json", "SECURITY.md"]) assert.equal(sourceAllowed(file), true, file);
});

test("audit detects synthetic secrets and personal identifiers without returning values", () => {
  const secret = "sk-" + "z".repeat(40);
  const personalPath = ["C:", "Users", "fixture-person", "file"].join("\\");
  const text = [secret, "-----BEGIN " + "PRIVATE KEY-----", personalPath, "person" + "@private-mail.invalid", "fixture-device"].join("\n");
  const findings = scanText("fixture.txt", text, ["fixture-device"]);
  for (const rule of ["provider-token", "private-key", "personal-home-path", "email-address", "local-identity"]) assert.ok(findings.some(finding => finding.rule === rule), rule);
  assert.equal(JSON.stringify(findings).includes(secret), false);
  assert.equal(JSON.stringify(findings).includes("fixture-person"), false);
});
