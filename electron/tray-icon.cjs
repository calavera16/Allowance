const zlib = require("node:zlib");

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const STATUS_COLORS = {
  waiting: [137, 148, 163],
  critical: [255, 111, 115],
  warning: [244, 191, 100],
  healthy: [124, 224, 194],
};

function statusColor(remaining) {
  if (remaining === null || !Number.isFinite(remaining)) {
    return STATUS_COLORS.waiting;
  }
  if (remaining <= 10) return STATUS_COLORS.critical;
  if (remaining <= 30) return STATUS_COLORS.warning;
  return STATUS_COLORS.healthy;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function compositePixel(pixels, offset, color, alpha) {
  const previousAlpha = pixels[offset + 3] / 255;
  const outputAlpha = alpha + previousAlpha * (1 - alpha);
  if (outputAlpha === 0) return;

  for (let channel = 0; channel < 3; channel += 1) {
    pixels[offset + channel] = Math.round(
      (color[channel] * alpha +
        pixels[offset + channel] * previousAlpha * (1 - alpha)) /
        outputAlpha,
    );
  }
  pixels[offset + 3] = Math.round(outputAlpha * 255);
}

function createTrayRgba(remaining, size) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const radius = size * 0.43;
  const ringRadius = size * 0.33;
  const ringHalfWidth = size * 0.075;
  const dotRadius = size * 0.095;
  const progress =
    remaining === null || !Number.isFinite(remaining)
      ? 0.75
      : Math.max(0, Math.min(100, remaining)) / 100;
  const progressColor = statusColor(remaining);
  const samplesPerAxis = 4;
  const sampleCount = samplesPerAxis * samplesPerAxis;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let diskCoverage = 0;
      let baseRingCoverage = 0;
      let progressCoverage = 0;
      let dotCoverage = 0;

      for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
        for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
          const dx = x + (sampleX + 0.5) / samplesPerAxis - center;
          const dy = y + (sampleY + 0.5) / samplesPerAxis - center;
          const distance = Math.hypot(dx, dy);
          if (distance <= radius) diskCoverage += 1;
          if (Math.abs(distance - ringRadius) <= ringHalfWidth) {
            baseRingCoverage += 1;
            const angle = (Math.atan2(dy, dx) + Math.PI * 2.5) % (Math.PI * 2);
            if (angle <= progress * Math.PI * 2) progressCoverage += 1;
          }
          if (distance <= dotRadius) dotCoverage += 1;
        }
      }

      const offset = (y * size + x) * 4;
      compositePixel(
        pixels,
        offset,
        [16, 23, 34],
        diskCoverage / sampleCount,
      );
      compositePixel(
        pixels,
        offset,
        [63, 75, 89],
        baseRingCoverage / sampleCount,
      );
      compositePixel(
        pixels,
        offset,
        progressColor,
        progressCoverage / sampleCount,
      );
      compositePixel(
        pixels,
        offset,
        progressColor,
        dotCoverage / sampleCount,
      );
    }
  }

  return pixels;
}

function createTrayPng(remaining, size = 16) {
  if (!Number.isInteger(size) || size < 8 || size > 256) {
    throw new RangeError("Tray icon size must be an integer from 8 to 256");
  }

  const rgba = createTrayRgba(remaining, size);
  const scanlines = Buffer.alloc(size * (1 + size * 4));
  const stride = size * 4;
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (stride + 1);
    scanlines[rowOffset] = 0;
    rgba.copy(scanlines, rowOffset + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { createTrayPng, statusColor };
