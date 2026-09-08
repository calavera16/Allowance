const assert = require("node:assert/strict");
const test = require("node:test");
const { createTrayPng, statusColor } = require("./tray-icon.cjs");

test("creates valid PNG buffers at Windows tray icon sizes", () => {
  for (const size of [16, 32]) {
    const png = createTrayPng(72, size);
    assert.deepEqual(
      [...png.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.ok(png.length > 100);
  }
});

test("uses distinct colors for each remaining-allowance state", () => {
  assert.deepEqual(statusColor(null), [137, 148, 163]);
  assert.deepEqual(statusColor(5), [255, 111, 115]);
  assert.deepEqual(statusColor(20), [244, 191, 100]);
  assert.deepEqual(statusColor(72), [124, 224, 194]);
  assert.notDeepEqual(createTrayPng(5), createTrayPng(72));
});
