// Render the shared vector mark into Windows assets without an image editor.
const fs = require("node:fs");
const path = require("node:path");

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require("node:child_process").spawnSync(require("electron"), [__filename], {
    env, stdio: "inherit", windowsHide: true, timeout: 30000,
  });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow } = require("electron");
  app.disableHardwareAcceleration();
  app.setPath("userData", fs.mkdtempSync(path.join(require("node:os").tmpdir(), "allowance-icons-")));
  let win;
  app.whenReady().then(async () => {
    const asset = name => path.join(__dirname, "../assets", name);
    const svg = "data:image/svg+xml;base64," + fs.readFileSync(asset("icon.svg")).toString("base64");
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    await win.loadURL("data:text/html,<html><body></body></html>");
    const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
    const rendered = await win.webContents.executeJavaScript(`(async () => {
      const image = new Image(); image.src = ${JSON.stringify(svg)}; await image.decode();
      return ${JSON.stringify(sizes)}.map(size => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      });
    })()`);
    const pngs = rendered.map(value => Buffer.from(value, "base64"));
    fs.writeFileSync(asset("icon.png"), pngs.at(-1));
    const count = sizes.length - 1;
    const header = Buffer.alloc(6 + 16 * count);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
    let offset = header.length;
    for (let index = 0; index < count; index++) {
      const entry = 6 + index * 16;
      header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
      header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(pngs[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
      offset += pngs[index].length;
    }
    fs.writeFileSync(asset("icon.ico"), Buffer.concat([header, ...pngs.slice(0, count)]));
    console.log("Rendered icon.png (512px) and icon.ico (16, 24, 32, 48, 64, 128, 256px) from assets/icon.svg.");
    win.destroy(); app.exit(0);
  }).catch(error => { console.error(error); win?.destroy(); app.exit(1); });
}
