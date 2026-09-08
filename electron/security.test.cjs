const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { trustedRendererUrl, trustedSender, publicUpdateUrl, redactText, redactDetails, exportPayload } = require("./security.cjs");
const index = path.resolve("dist/index.html"), url = pathToFileURL(index).href;

test("renderer trust rejects other files, remote origins and URL prefix tricks", () => {
  for (const suffix of ["", "?mode=compact", "?mode=overlay"]) assert.equal(trustedRendererUrl(url + suffix, true, index), true);
  for (const candidate of [pathToFileURL(path.resolve("README.md")).href, "https://example.com", url + "?other=value", "file://server/share/index.html"]) {
    assert.equal(trustedRendererUrl(candidate, true, index), false);
  }
  assert.equal(trustedRendererUrl("http://127.0.0.1:1420/?mode=compact", false, index), true);
  for (const candidate of ["http://127.0.0.1:14200", "http://" + "127.0.0.1:1420@evil.example.com", "http://127.0.0.1:1420/other", "data:text/html,test"]) {
    assert.equal(trustedRendererUrl(candidate, false, index), false);
  }
});

test("IPC requires an owned window and its main frame", () => {
  const frame = { url }, sender = { mainFrame: frame }, win = { webContents: sender, isDestroyed: () => false };
  assert.equal(trustedSender({ sender, senderFrame: frame }, [win], true, index), true);
  assert.equal(trustedSender({ sender, senderFrame: { url } }, [win], true, index), false);
  assert.equal(trustedSender({ sender, senderFrame: frame }, [], true, index), false);
  assert.equal(trustedSender({ sender, senderFrame: null }, [win], true, index), false);
  frame.url = "https://example.com";
  assert.equal(trustedSender({ sender, senderFrame: frame }, [win], true, index), false);
});

test("updates require a public HTTPS endpoint without embedded credentials", () => {
  assert.equal(publicUpdateUrl("https://github.com/example/allowance/releases/latest/download/"), "https://github.com/example/allowance/releases/latest/download/");
  for (const value of [undefined, "http://updates.example.com", "https://user:pass@updates.example.com", "https://updates.example.com/?token=test", "https://updates.example.com/#fragment", "https://localhost/", "https://127.0.0.1", "file:///update", "https://updates.internal", "https://updates.example.com:8080"]) assert.equal(publicUpdateUrl(value), null);
});

test("diagnostics remove tokens, personal home names, emails and URL secrets", () => {
  const token = "sk-" + "a".repeat(40), home = ["C:", "Users", "fixture-person", "data.json"].join("\\");
  const input = { error: `${home} ${token} ${"fixture" + "@example.com"} Bearer ${"b".repeat(30)}`, url: "https://user:pass@updates.example.com/path?credential=private" };
  const output = JSON.stringify(redactDetails(input));
  for (const secret of ["fixture-person", token, "fixture@", "user:pass", "credential=private", "b".repeat(30)]) assert.equal(output.includes(secret), false);
  assert.match(redactText('api_key="' + "secret-value" + '"'), /removed/);
  assert.match(output, /data.json/);
});

test("exports validate type and force a safe filename extension", () => {
  for (const value of [{ kind: "exe", content: "data" }, { kind: "csv", content: {} }, null]) assert.throws(() => exportPayload(value));
  assert.equal(exportPayload({ kind: "csv", content: "data", suggestedName: "../payload.exe" }).safeName, "---payload-exe.csv");
  assert.throws(() => exportPayload({ kind: "json", content: "x".repeat(64 * 1024 * 1024 + 1) }), /64 MB/);
});

test("CSV cells cannot start executable formulas, even after whitespace", async () => {
  const fs = require("node:fs"), ts = require("typescript");
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/csv.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { csvEscape } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  for (const value of ["=1+1", "+1+1", "-1+1", "@SUM(1)", " \t=1", "\ttext", "\rtext", "\ntext"]) assert.equal(csvEscape(value).startsWith('"\''), true);
  assert.equal(csvEscape('Work, "demo"'), '"Work, ""demo"""');
  assert.equal(csvEscape(52), '"52"');
});
