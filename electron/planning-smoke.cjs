// Hidden, isolated renderer smoke test. Never loads CLI collectors or real user profiles.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { animatedGif } = require("./gif-fixture.cjs");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "allowance-smoke-")));
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
const outputDir = path.join(__dirname, "../release/smoke");
const overlayOnly = process.argv.includes("--overlay-only");
const storageSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/companion-assets.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^export /gm, '');
let win;
async function evaluate(code) { return win.webContents.executeJavaScript(code, true); }
async function reload() {
  await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.reload(); });
}
async function waitFor(code) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (await evaluate(code)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.error(await evaluate("({ body: document.body.innerText.slice(-3500), data: localStorage.getItem('allowance.data.v2')?.slice(0, 700) })"));
  console.error(await evaluate("[...document.images].map(i => ({ source: i.src, width: i.naturalWidth, complete: i.complete, display: getComputedStyle(i).display }))"));
  throw new Error(`Timed out: ${code}`);
}
async function click(text) {
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) throw new Error('Button unavailable: ' + ${JSON.stringify(text)}); b.click(); })()`);
}
async function screenshot(name) {
  if (overlayOnly) return;
  // Wake the hidden compositor before capturing its newly rendered contents.
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await new Promise(resolve => setTimeout(resolve, 100));
  fs.writeFileSync(path.join(outputDir, name), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
}
async function dashboardSmoke(errors) {
  win = new BrowserWindow({ width: 1280, height: 1080, show: false, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  await win.loadFile(path.join(__dirname, "../dist/index.html"));
  await waitFor("document.querySelector('.planning-hub') && !document.querySelector('.session-bar button').disabled");
  await evaluate(`localStorage.setItem('allowance.data.v2', JSON.stringify({ schemaVersion: 2, setupComplete: true, activeProfileId: 'smoke', profiles: [{ id: 'smoke', name: 'Smoke test', history: [], settings: {} }] }));`);
  await reload();
  await waitFor("document.querySelector('.planning-hub') && !document.querySelector('.wizard') && !document.querySelector('.session-bar button').disabled");
  assert.equal(await evaluate("Boolean(document.querySelector('.scenario-row'))"), false, "Overview does not expose forecast controls");
  await click("Plan");
  assert.ok(await evaluate("document.body.innerText.includes('Use Codex')"));
  assert.equal(await evaluate("document.querySelectorAll('.scenario-row').length"), 4);
  assert.equal(await evaluate("document.querySelectorAll('.timeline-row').length"), 4);
  await evaluate("document.querySelector('.planning-hub').scrollIntoView()");
  await screenshot("plan-desktop.png");
  await evaluate(`(() => { const input = document.getElementById('session-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Build the next idea'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Start coding");
  await waitFor("document.body.innerText.includes('Session running')");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.active.name"), "Build the next idea");
  await reload();
  await waitFor("document.body.innerText.includes('Session running') && !document.querySelector('.session-bar button').disabled");
  await click("Finish session");
  await waitFor("!JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.active");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.sessions.length"), 1);
  await click("Activity");
  await waitFor("document.querySelectorAll('button.heatmap-day').length === 90");
  await evaluate("document.querySelector('button.heatmap-day').click()");
  assert.ok(await evaluate("document.querySelector('.day-detail').textContent.includes('No window observations')"));
  await evaluate("document.querySelector('.planning-hub').scrollIntoView()");
  await screenshot("activity-desktop.png");
  await click("Companion");
  await evaluate(`(() => { const select = document.querySelector('.companion-controls select'); select.value = 'robot'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor("JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.companion === 'robot'");
  await click("Plan");
  await evaluate(`(() => { const input = document.querySelector('[aria-label="Reserve percentage"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '25'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.reserve === 25");
  await evaluate("document.querySelector('[aria-label=Sunday]').click()");
  await waitFor("JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.workingDays.includes(0)");
  await evaluate(`(() => { const input = document.querySelector('[aria-label="Usage intensity"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelector('.intensity-control').textContent.includes('Heavy')");
  await click("24 hours");
  assert.ok(await evaluate("document.querySelector('.timeline-axis').textContent.includes('24 hours')"));
  win.setSize(480, 960);
  await evaluate("document.querySelector('.planning-hub').scrollIntoView()");
  await screenshot("plan-narrow.png");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "No horizontal page overflow at narrow size");
  await click("Activity");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Heatmap scroll stays inside its card");
  await screenshot("activity-narrow.png");
  await click("Plan");
  // Seed richer observations to exercise populated heatmaps and forecast ranges.
  await evaluate(`(() => {
    const data = JSON.parse(localStorage.getItem('allowance.data.v2')), profile = data.profiles[0], now = Math.floor(Date.now()/1000);
    profile.insights.series.forEach(s => {
      const last = s.points.at(-1);
      const row = [...document.querySelectorAll('.timeline-row')].find(r => r.querySelector('strong').textContent === (s.provider === 'codex' ? 'Codex' : 'Claude') + ' · ' + s.label);
      const reset = new Date(row.querySelector('time').dateTime).getTime()/1000;
      s.points = Array.from({ length: 13 }, (_, i) => [now - 3600 + i*300, Math.min(100, last[1] + 12 - i), reset]);
    });
    profile.insights.days = Array.from({ length: 80 }, (_, i) => { const d = new Date(); d.setDate(d.getDate()-i); const date = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); return { date, partial: false, usage: profile.insights.series.map(s => ({ key: s.key, provider: s.provider, label: s.label, used: (i*7)%31 })) }; }).reverse();
    localStorage.setItem('allowance.data.v2', JSON.stringify(data)); window.dispatchEvent(new Event('storage'));
  })()`);
  await click("Activity");
  await waitFor("document.querySelectorAll('.heatmap-day[data-level=\"4\"]').length > 1");
  win.setSize(1280, 1080);
  await evaluate("document.querySelector('.planning-hub').scrollIntoView()");
  await screenshot("activity-populated.png");
  await click("Plan");
  await waitFor("document.body.innerText.includes('Recent pace range')");
  await screenshot("plan-populated.png");
  await click("Companion");
  // Exercise the real file input and IndexedDB store without a visible file dialog.
  const gifPath = path.join(outputDir, "test-companion.gif");
  fs.writeFileSync(gifPath, animatedGif());
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  const chooseFile = async filePath => {
    const { root } = await win.webContents.debugger.sendCommand("DOM.getDocument");
    const { nodeId } = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { nodeId, files: [filePath] });
  };
  await chooseFile(gifPath);
  await waitFor("document.querySelector('.custom-gif-animation')?.naturalWidth === 32");
  const customCompanion = await evaluate("JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.customCompanion");
  assert.equal(customCompanion.name, "test-companion.gif");
  assert.equal(customCompanion.bytes, animatedGif().length);
  assert.ok(await evaluate("!localStorage.getItem('allowance.data.v2').includes('data:image/gif')"), "Image bytes are stored separately from profile history");
  await evaluate("document.querySelector('.companion-card').scrollIntoView()");
  // drawImage(HTMLImageElement) uses a GIF's default frame, so decode both frames explicitly.
  const animation = await evaluate(`(async () => {
    const decoder = new ImageDecoder({ data: Uint8Array.from(atob(${JSON.stringify(animatedGif().toString('base64'))}), c => c.charCodeAt(0)), type: 'image/gif' });
    await decoder.tracks.ready;
    const colors = [];
    for (let i = 0; i < 2; i++) { const frame = await decoder.decode({ frameIndex: i }); const c = document.createElement('canvas'); c.width = c.height = 1; c.getContext('2d').drawImage(frame.image, 0, 0, 1, 1); colors.push([...c.getContext('2d').getImageData(0,0,1,1).data].join(',')); frame.image.close(); }
    decoder.close(); return colors;
  })()`);
  assert.notEqual(animation[0], animation[1], "Original GIF has two different animation frames");
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.custom-gif-animation')).display"), "none");
  await screenshot("custom-gif-desktop.png");
  await evaluate(`(() => { const input = document.querySelector('[aria-label="Custom companion size"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '96'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.companionSize === 96");
  await evaluate("document.querySelector('.gif-options input[type=checkbox]').click()");
  await waitFor("getComputedStyle(document.querySelector('.custom-gif-animation')).display === 'none'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.custom-gif-still')).display"), "block");
  assert.equal(await evaluate("document.querySelector('.custom-gif-still').width"), 32);
  assert.equal(await evaluate("document.querySelector('.custom-gif-still').getContext('2d').getImageData(0,0,1,1).data[3]"), 255);
  await evaluate("document.querySelector('.gif-options input[type=checkbox]').click()");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await waitFor("getComputedStyle(document.querySelector('.custom-gif-animation')).display === 'none'");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
  const invalidPath = path.join(outputDir, "invalid-companion.gif");
  fs.writeFileSync(invalidPath, "This is not a GIF");
  await chooseFile(invalidPath);
  await waitFor("document.querySelector('.gif-error')?.textContent.includes('not a GIF')");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.customCompanion.id"), customCompanion.id);
  await chooseFile(gifPath);
  await waitFor("!document.querySelector('.gif-error') && !document.querySelector('.gif-picker-row button').disabled");
  await reload();
  await waitFor("document.querySelector('.workspace-nav')");
  await click("Companion");
  await waitFor("document.querySelector('.custom-gif-animation')?.naturalWidth === 32");
  // Test the production backup helpers against the renderer's real IndexedDB.
  await evaluate(`window.gifTest = (() => { ${storageSource}; return { exportCompanionGifs, restoreCompanionGifs, readCompanionGif, inspectGif }; })(); void 0`);
  const roundTrip = await evaluate(`(async () => {
    const id = ${JSON.stringify(customCompanion.id)};
    const saved = await gifTest.exportCompanionGifs([id, id]);
    await new Promise((resolve, reject) => { const r = indexedDB.open('allowance.companions.v1', 1); r.onsuccess = () => { const db = r.result, tx = db.transaction('gifs', 'readwrite'); tx.objectStore('gifs').clear(); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = reject; }; });
    let missing = false; try { await gifTest.readCompanionGif(id); } catch { missing = true; }
    await gifTest.restoreCompanionGifs(saved, [id]);
    const blob = await gifTest.readCompanionGif(id);
    let rejected = false; try { await gifTest.restoreCompanionGifs([{ id, dataUrl: 'data:image/gif;base64,AAAA' }], [id]); } catch { rejected = true; }
    let oversized = false; try { await gifTest.inspectGif(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)])); } catch(e) { oversized = e.message.includes('20 MB'); }
    return { count: saved.length, missing, rejected, oversized, size: blob.size, id: (await gifTest.inspectGif(blob)).id };
  })()`);
  assert.deepEqual(roundTrip, { count: 1, missing: true, rejected: true, oversized: true, size: animatedGif().length, id: customCompanion.id });
  await click("Remove GIF");
  await waitFor("!JSON.parse(localStorage.getItem('allowance.data.v2')).profiles[0].insights.customCompanion");
  await chooseFile(gifPath);
  await waitFor("document.querySelector('.custom-gif-animation')?.naturalWidth === 32");
  win.webContents.debugger.detach();
  win.destroy();
  return customCompanion;
}
app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const errors = [];
  let customCompanion = overlayOnly ? null : await dashboardSmoke(errors);
  win = new BrowserWindow({ width: 360, height: 148, frame: false, show: false, webPreferences: { preload: path.join(__dirname, 'planning-smoke-preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  await win.loadFile(path.join(__dirname, "../dist/index.html"), { query: { mode: "overlay" } });
  if (overlayOnly) {
    customCompanion = await evaluate(`(async () => { ${storageSource};
      return importCompanionGif(new File([Uint8Array.from(atob(${JSON.stringify(animatedGif().toString('base64'))}), c => c.charCodeAt(0))], 'test-companion.gif', { type: 'image/gif' })); })()`);
  }
  await waitFor("document.querySelector('.companion--happy')");
  await screenshot("overlay-cat.png");
  const overlayState = (remaining, companion, resetAt = 0) => ({ profileName: "Overlay test", minimumRemaining: remaining, companion, lastResetAt: resetAt,
    providers: [{ name: "Codex", remaining, status: "connected" }, { name: "Claude", remaining: 80, status: "connected" }] });
  win.webContents.send("smoke:overlay", overlayState(5, "cat"));
  await waitFor("document.querySelector('.companion--sleeping')");
  await screenshot("overlay-sleeping.png");
  win.webContents.send("smoke:overlay", overlayState(90, "robot", Date.now() / 1000));
  await waitFor("document.querySelector('.companion--waking')");
  await screenshot("overlay-waking.png");
  win.webContents.send("smoke:overlay", overlayState(25, "plant"));
  await waitFor("document.querySelector('.companion--tired')");
  win.setSize(260, 112);
  await screenshot("overlay-minimum.png");
  assert.ok(await evaluate("document.querySelector('.overlay-providers').getBoundingClientRect().bottom <= innerHeight"), "Companion fits the smallest overlay");
  win.webContents.send("smoke:overlay", overlayState(null, "plant"));
  await waitFor("document.querySelector('.companion--waiting')");
  win.webContents.send("smoke:overlay", overlayState(80, "none"));
  await waitFor("!document.querySelector('.companion')");
  win.webContents.send("smoke:overlay", { ...overlayState(80, "custom"), customCompanion, companionSize: 96, companionAnimated: true });
  await waitFor("document.querySelector('.custom-gif-animation')?.naturalWidth === 32");
  assert.ok(await evaluate("document.querySelector('.overlay-providers').getBoundingClientRect().bottom <= innerHeight"), "Custom GIF fits the smallest overlay");
  await screenshot("overlay-custom-gif.png");
  win.webContents.send("smoke:overlay", { ...overlayState(80, "custom"), customCompanion, companionSize: 64, companionAnimated: false });
  await waitFor("getComputedStyle(document.querySelector('.custom-gif-animation')).display === 'none'");
  const gifWidth = () => evaluate("document.querySelector('.companion--custom').getBoundingClientRect().width");
  const resizeOverlay = async (width, height) => {
    win.setSize(width, height);
    // Explicit viewport sizes avoid delayed native resize events in hidden Windows renderers.
    win.webContents.enableDeviceEmulation({ screenPosition: "desktop", screenSize: { width: 1920, height: 1080 },
      viewPosition: { x: 0, y: 0 }, viewSize: { width, height }, deviceScaleFactor: 0, scale: 1 });
    await waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
  };
  const assertGifFits = async () => {
    const layout = await evaluate(`(() => {
      const gif = document.querySelector('.companion--custom').getBoundingClientRect();
      const media = [...document.querySelectorAll('.companion--custom img, .companion--custom canvas')].find(element => getComputedStyle(element).display !== 'none').getBoundingClientRect();
      const total = document.querySelector('.overlay-total').getBoundingClientRect();
      const providers = document.querySelector('.overlay-providers');
      return { square: Math.abs(gif.width - gif.height) < 1,
        contained: media.left >= gif.left - 1 && media.top >= gif.top - 1 && media.right <= gif.right + 1 && media.bottom <= gif.bottom + 1,
        inWindow: gif.left >= 0 && gif.top >= 0 && gif.right <= innerWidth && gif.bottom <= innerHeight,
        clearOfText: document.querySelector('.overlay-brand').getBoundingClientRect().right <= total.left,
        clearOfProviders: getComputedStyle(providers).display === 'none' || (gif.bottom <= providers.getBoundingClientRect().top && providers.getBoundingClientRect().bottom <= innerHeight) };
    })()`);
    for (const [check, passed] of Object.entries(layout)) assert.ok(passed, `Custom GIF layout: ${check}`);
  };
  await resizeOverlay(360, 148);
  const defaultGifWidth = await gifWidth();
  await resizeOverlay(720, 296);
  assert.ok(await gifWidth() > defaultGifWidth * 1.9, "GIF grows with the overlay instead of staying at a fixed pixel size");
  await assertGifFits();
  await resizeOverlay(360, 148);
  assert.ok(Math.abs(await gifWidth() - defaultGifWidth) < 1, "GIF returns to its original size when the overlay shrinks");
  for (const deviceScaleFactor of [1, 1.5, 2]) {
    win.webContents.enableDeviceEmulation({ screenPosition: "desktop", screenSize: { width: 1920, height: 1080 },
      viewPosition: { x: 0, y: 0 }, viewSize: { width: 360, height: 148 }, deviceScaleFactor, scale: 1 });
    await waitFor(`devicePixelRatio === ${deviceScaleFactor}`);
    assert.ok(Math.abs(await gifWidth() - defaultGifWidth) < 1, "Display scaling keeps the GIF proportional to the overlay");
    await assertGifFits();
  }
  win.webContents.disableDeviceEmulation();
  for (const animated of [true, false]) {
    win.webContents.send("smoke:overlay", { ...overlayState(80, "custom"), customCompanion, companionSize: 96, companionAnimated: animated });
    await waitFor(`document.querySelector('.companion--custom').dataset.animated === '${animated}'`);
    for (const locked of [true, false]) {
      win.webContents.send("smoke:overlay-preferences", { enabled: true, locked, opacity: 0.9, bounds: null });
      await waitFor(`document.querySelector('.overlay-shell').classList.contains('overlay-shell--editing') === ${!locked}`);
      for (const [width, height] of [[260, 112], [360, 148], [720, 180], [260, 600], [900, 600]]) {
        await resizeOverlay(width, height);
        await assertGifFits();
      }
    }
  }
  for (const [width, height] of [[32, 96], [96, 32]]) {
    const bytes = animatedGif(width, height).toString("base64");
    const asset = await evaluate(`(async () => { ${storageSource};
      return importCompanionGif(new File([Uint8Array.from(atob(${JSON.stringify(bytes)}), c => c.charCodeAt(0))], 'rectangular.gif', { type: 'image/gif' })); })()`);
    for (const animated of [true, false]) {
      win.webContents.send("smoke:overlay", { ...overlayState(80, "custom"), customCompanion: asset, companionSize: 96, companionAnimated: animated });
      await waitFor(`document.querySelector('.custom-gif-animation')?.naturalWidth === ${width} && document.querySelector('.custom-gif-animation')?.naturalHeight === ${height} && document.querySelector('.companion--custom').dataset.animated === '${animated}'`);
      await resizeOverlay(260, 112);
      await assertGifFits();
      await resizeOverlay(720, 296);
      await assertGifFits();
    }
  }
  win.webContents.disableDeviceEmulation();
  assert.deepEqual(errors, [], "No renderer console errors");
  console.log(overlayOnly ? "Overlay smoke passed: GIF resizing, display scaling, animation/pause, rectangular images, and editing layouts." : "Planning smoke passed: sessions, budgets, scenarios, timeline, heatmap, companions, custom GIF import/animation/pause/restart/backup restoration/invalid files/removal, and responsive overlays.");
  if (!overlayOnly) console.log(`Screenshots: ${outputDir}`);
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); win?.destroy(); app.exit(1); });
