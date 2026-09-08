// Two solid-color frames for verifying animation, original bytes, and pause behavior.
function animatedGif(width = 32, height = 32) {
  const header = Buffer.concat([Buffer.from("GIF89a"), Buffer.from([width, 0, height, 0, 0x80, 0, 0, 124, 224, 194, 255, 148, 105])]);
  const loop = Buffer.concat([Buffer.from([0x21, 0xff, 11]), Buffer.from("NETSCAPE2.0"), Buffer.from([3, 1, 0, 0, 0])]);
  const frame = color => {
    const codes = [];
    for (let i = 0; i < width * height; i++) codes.push(4, color);
    codes.push(5);
    const packed = Buffer.alloc(Math.ceil(codes.length * 3 / 8));
    codes.forEach((code, i) => {
      const bit = i * 3;
      packed[bit >> 3] |= code << (bit % 8);
      if (bit % 8 > 5) packed[(bit >> 3) + 1] |= code >> (8 - bit % 8);
    });
    const blocks = [];
    for (let i = 0; i < packed.length; i += 255) { const block = packed.subarray(i, i + 255); blocks.push(Buffer.from([block.length]), block); }
    return Buffer.concat([Buffer.from([0x21, 0xf9, 4, 4, 15, 0, 0, 0, 0x2c, 0, 0, 0, 0, width, 0, height, 0, 0, 2]), ...blocks, Buffer.from([0])]);
  };
  return Buffer.concat([header, loop, frame(0), frame(1), Buffer.from([0x3b])]);
}
module.exports = { animatedGif };
