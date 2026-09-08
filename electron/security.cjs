const path = require("node:path");
const { pathToFileURL } = require("node:url");

function trustedRendererUrl(value, built, indexPath) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (built) {
      const expected = new URL(pathToFileURL(path.resolve(indexPath)).href);
      if (url.protocol !== "file:" || url.host !== expected.host || url.pathname !== expected.pathname) return false;
    } else if (url.origin !== "http://127.0.0.1:1420" || url.pathname !== "/") return false;
    return [...url.searchParams].every(([key, value]) => key === "mode" && ["compact", "overlay"].includes(value));
  } catch { return false; }
}

function trustedSender(event, windows, built, indexPath) {
  return Boolean(event.senderFrame && windows.some(target => target && !target.isDestroyed() && target.webContents === event.sender) &&
    event.senderFrame === event.sender.mainFrame && trustedRendererUrl(event.senderFrame.url, built, indexPath));
}

function publicUpdateUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    // Updates are publisher-controlled public HTTPS endpoints, never authenticated URLs.
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      (url.port && url.port !== "443") || !url.hostname.includes(".") ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) || url.hostname.includes(":") ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

function redactText(value) {
  return String(value).slice(0, 100_000)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[private key removed]")
    .replace(/\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g, "[token removed]")
    .replace(/\bBearer\s+[^\s"'<>]+/gi, "Bearer [removed]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, "$1[removed]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, value => {
      try { const url = new URL(value); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.href; }
      catch { return "[URL removed]"; }
    })
    .replace(/[A-Z]:[\\/]+Users[\\/]+[^\\/\s"']+/gi, "%USERPROFILE%")
    .replace(/\/(?:Users|home)\/[^/\s"']+/g, "~")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]");
}

function redactDetails(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactDetails);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDetails(item)]));
  return value;
}

function exportPayload(payload) {
  if (!["csv", "json"].includes(payload?.kind) || typeof payload.content !== "string") throw new Error("Invalid export format or content.");
  if (Buffer.byteLength(payload.content, "utf8") > 64 * 1024 * 1024) throw new Error("Export is larger than 64 MB.");
  const base = typeof payload.suggestedName === "string" ? payload.suggestedName : "allowance-export";
  const safeName = base.replace(/\.(?:csv|json)$/i, "").replace(/[<>:"/\\|?*\x00-\x1f.]/g, "-").slice(0, 120).trim() || "allowance-export";
  return { kind: payload.kind, content: payload.content, safeName: `${safeName}.${payload.kind}` };
}

module.exports = { trustedRendererUrl, trustedSender, publicUpdateUrl, redactText, redactDetails, exportPayload };
