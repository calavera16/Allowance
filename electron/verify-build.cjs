const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(__dirname, "..", "dist", "index.html");
const html = fs.readFileSync(indexPath, "utf8");
const absoluteAsset = /(?:src|href)=["']\/assets\//;

const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
if (!csp || !csp.includes("connect-src 'none'") || !csp.includes("script-src 'self';") ||
    !csp.includes("object-src 'none'") || /localhost|127\.0\.0\.1|unsafe-eval/.test(csp)) {
  throw new Error("Production Content Security Policy is missing or too permissive.");
}

if (absoluteAsset.test(html)) {
  throw new Error(
    "Packaged build contains drive-root asset URLs. Vite base must remain './'.",
  );
}

const assets = [...html.matchAll(/(?:src|href)=["']\.\/(assets\/[^"']+)/g)].map(
  (match) => match[1],
);
if (!assets.length) {
  throw new Error("Packaged build did not reference any relative assets.");
}
for (const asset of assets) {
  if (!fs.existsSync(path.join(__dirname, "..", "dist", asset))) {
    throw new Error(`Packaged asset is missing: ${asset}`);
  }
}

console.log(`Verified ${assets.length} relative packaged asset paths.`);
