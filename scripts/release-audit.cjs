// Read-only Git inspection; source export never copies Git metadata or local data.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const rootFiles = new Set([".gitignore", ".gitattributes", ".env.example", "README.md", "PROJECT_OVERVIEW.md", "LICENSE", "SECURITY.md", "RELEASING.md", "CHANGELOG.md", "DESIGN_REVIEW_IMPLEMENTATION.md", "package.json", "package-lock.json", "index.html", "vite.config.ts", "tsconfig.json", "tsconfig.node.json"]);
const skippedDirectories = new Set(["node_modules", "dist", "release", ".git", ".claude", ".codex", ".idea", ".vscode", "src-tauri", "coverage", "test-results", "playwright-report"]);
function sensitiveName(file) {
  if (file === ".env.example") return false;
  return /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|[^/]*(?:credentials|secrets)[^/]*\.json|claude-status[^/]*\.json|overlay-settings\.json|allowance-(?:backup|export|history)[^/]*\.(?:json|csv))$/i.test(file) || /\.(?:pem|key|pfx|p12|jks|keystore|jsonl|db|sqlite\d*|backup|bak|dmp|log|tmp|zip)$/i.test(file);
}
function sourceAllowed(file) {
  if (sensitiveName(file)) return false;
  return rootFiles.has(file) || file === "build/installer.nsh" || /^(?:electron|scripts)\/[^/]+\.cjs$/.test(file) ||
    /^src\/(?:[^/]+\/)*[^/]+\.(?:ts|tsx|css)$/.test(file) || /^assets\/icon\.(?:svg|png|ico)$/.test(file) ||
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);
}
function inventory(directory = root, prefix = "") {
  const selected = [], unexpected = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) { unexpected.push({ file: relative, rule: "symlink-not-exported" }); continue; }
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name) || relative === "assets/platform-icons") continue;
      const nested = inventory(path.join(directory, entry.name), relative + "/");
      selected.push(...nested.selected); unexpected.push(...nested.unexpected);
    } else if (sourceAllowed(relative)) selected.push(relative);
    else if (!sensitiveName(relative) && ![".DS_Store", "Thumbs.db", "DESIGN_REVIEW.md"].includes(entry.name)) unexpected.push({ file: relative, rule: "unexpected-file-review-required" });
  }
  return { selected: selected.sort(), unexpected };
}
const rules = [
  ["private-key", /-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/g],
  ["provider-token", /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|AKIA[A-Z0-9]{16})\b/g],
  ["credential-assignment", /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|CSC_KEY_PASSWORD)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_+\/-]{12,}["']/gi],
  ["personal-home-path", /(?:[A-Z]:[\\/]+Users[\\/]+|\/(?:Users|home)\/)[A-Za-z0-9_.-]+/gi],
  ["email-address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["authenticated-url", /https?:\/\/[^\s/"'<>]+:[^\s/"'<>]+@/gi],
];
function scanText(file, content, identities = []) {
  const findings = [];
  for (const [rule, pattern] of rules) {
    for (const match of content.matchAll(pattern)) {
      // Upstream package deprecation metadata contains its public maintainer email.
      if (rule === "email-address" && file === "package-lock.json" && match[0] === "i" + "@izs.me") continue;
      // Reserved example domains in synthetic tests and documentation are not identities.
      if (rule === "email-address" && /@(?:example\.(?:com|org|net)|[^@]+\.example\.com)$/i.test(match[0])) continue;
      // Deliberately invalid URL fixtures exercise credential rejection; never real accounts.
      if (rule === "authenticated-url" && /^(?:electron\/security\.test\.cjs)$/.test(file) && match[0] === "https://" + "user:pass@") continue;
      findings.push({ file, line: content.slice(0, match.index).split("\n").length, rule });
    }
  }
  for (const identity of identities.filter(value => value && value.length >= 4 && !["user", "runner", "admin", "root", "default"].includes(value.toLowerCase()))) {
    const at = content.toLowerCase().indexOf(identity.toLowerCase());
    if (at >= 0) findings.push({ file, line: content.slice(0, at).split("\n").length, rule: "local-identity" });
  }
  return findings;
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw new Error("Git inspection could not finish.");
  return result;
}
function run() {
  const exporting = process.argv.includes("--export");
  const { selected, unexpected } = inventory();
  const identities = [process.env.USERNAME, process.env.COMPUTERNAME, path.basename(os.homedir())];
  const findings = [...unexpected];
  const manifest = [];
  for (const file of selected) {
    const buffer = fs.readFileSync(path.join(root, file));
    if (buffer.length > 16 * 1024 * 1024) findings.push({ file, rule: "source-file-too-large" });
    if (!/\.(?:png|ico)$/.test(file)) findings.push(...scanText(file, buffer.toString("utf8"), identities));
    manifest.push({ file, bytes: buffer.length, sha256: crypto.createHash("sha256").update(buffer).digest("hex") });
  }
  const top = git(["rev-parse", "--show-toplevel"]);
  const repositoryMatches = top.status === 0 && path.resolve(top.stdout.trim()).toLowerCase() === root.toLowerCase();
  let trackedFiles = 0;
  if (repositoryMatches) {
    const tracked = git(["ls-files", "-z", "--", "."]);
    if (tracked.status !== 0) throw new Error("Could not inspect tracked files.");
    const names = tracked.stdout.split("\0").filter(Boolean); trackedFiles = names.length;
    for (const file of names) if (!sourceAllowed(file)) findings.push({ file, rule: "tracked-file-outside-public-source-list" });
    const ignored = git(["ls-files", "-z", "--cached", "--ignored", "--exclude-standard", "--", "."]);
    if (ignored.status !== 0) throw new Error("Could not inspect tracked ignored files.");
    for (const file of ignored.stdout.split("\0").filter(Boolean)) findings.push({ file, rule: "ignored-file-already-tracked" });
  }
  const report = { generatedAt: new Date().toISOString(), version: require("../package.json").version, scope: "Working tree source allowlist; Git history requires an independent scan.", repositoryMatches, trackedFiles, scannedFiles: selected.length, findings, manifest };
  fs.mkdirSync(path.join(root, "release", "security"), { recursive: true });
  fs.writeFileSync(path.join(root, "release", "security", "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Scanned ${selected.length} public source files; ${findings.length} findings. Values are never printed.`);
  for (const finding of findings) console.log(`${finding.file}${finding.line ? ":" + finding.line : ""}: ${finding.rule}`);
  if (!repositoryMatches) console.error("Repository boundary is not the app directory. Do not push the enclosing repository. Use the clean export in a separate project-only repository.");
  if (findings.length) { process.exitCode = 1; return; }
  if (exporting) {
    const name = `Allowance-source-${report.version}-${Date.now()}`;
    const destination = path.join(root, "release", "source", name);
    fs.mkdirSync(destination, { recursive: true });
    for (const { file, sha256 } of manifest) {
      const output = path.join(destination, file);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(path.join(root, file), output);
      if (crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex") !== sha256) throw new Error("Source changed during export; rerun the audit.");
    }
    console.log(`Verified source export: release/source/${name}`);
  } else if (!repositoryMatches) process.exitCode = 1;
}
if (require.main === module) { try { run(); } catch { console.error("Release audit could not complete. Inspect the local configuration and retry."); process.exitCode = 1; } }
module.exports = { scanText, sourceAllowed, sensitiveName, inventory };
