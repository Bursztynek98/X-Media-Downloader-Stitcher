import fs from 'fs';
import path from 'path';
import { deflateSync } from 'zlib';

function createPNG(width, height, drawFn) {
  const buffer = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0;
    const line = buffer.subarray(y * width * 4, (y + 1) * width * 4);
    scanlines.set(line, y * (1 + width * 4) + 1);
  }

  const compressed = deflateSync(scanlines);

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = new Uint8Array(8 + len + 4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, len);
    buf[4] = type.charCodeAt(0);
    buf[5] = type.charCodeAt(1);
    buf[6] = type.charCodeAt(2);
    buf[7] = type.charCodeAt(3);
    buf.set(data, 8);
    const crcVal = crc32(buf.subarray(4, 8 + len));
    view.setUint32(8 + len, crcVal);
    return buf;
  }

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', new Uint8Array(0));

  const totalLength = sig.length + ihdr.length + idat.length + iend.length;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  out.set(sig, pos); pos += sig.length;
  out.set(ihdr, pos); pos += ihdr.length;
  out.set(idat, pos); pos += idat.length;
  out.set(iend, pos); pos += iend.length;

  return out;
}

function drawIcon(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;
  
  const r = 0.2;
  const dx = Math.max(Math.abs(nx - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(ny - 0.5) - (0.5 - r), 0);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > r) return [0, 0, 0, 0];

  const isArrow = (
    (nx >= 0.42 && nx <= 0.58 && ny >= 0.2 && ny <= 0.6) ||
    (ny >= 0.55 && ny <= 0.72 && Math.abs(nx - 0.5) <= (0.72 - ny) * 0.95) ||
    (nx >= 0.25 && nx <= 0.75 && ny >= 0.78 && ny <= 0.86)
  );

  if (isArrow) {
    return [255, 255, 255, 255];
  }

  const blueR = Math.round(29 + ny * 10);
  const blueG = Math.round(155 + nx * 30);
  const blueB = Math.round(240 - ny * 40);
  return [blueR, blueG, blueB, 255];
}

const iconsDir = path.join(import.meta.dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngData = createPNG(size, size, drawIcon);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), pngData);
  console.log(`Generated icon${size}.png`);
});
