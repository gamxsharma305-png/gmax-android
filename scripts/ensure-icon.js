/**
 * EAS / local: create assets/icon.png if missing.
 * Pure Node — no npm deps. Solid dark #050707 square + light center mark.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 4;
      const cx = x - size / 2;
      const cy = y - size / 2;
      const inMark =
        Math.abs(cx) < size * 0.22 &&
        Math.abs(cy) < size * 0.22 &&
        (Math.abs(cx) > size * 0.14 || Math.abs(cy) > size * 0.14 || (Math.abs(cx) < size * 0.08 && Math.abs(cy) < size * 0.08));
      if (inMark) {
        row[i] = 245;
        row[i + 1] = 245;
        row[i + 2] = 245;
        row[i + 3] = 255;
      } else {
        row[i] = 5;
        row[i + 1] = 7;
        row[i + 2] = 7;
        row[i + 3] = 255;
      }
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, "icon.png");
const png = makePng(1024);
fs.writeFileSync(out, png);
console.log("[ensure-icon] wrote", out, png.length, "bytes");
