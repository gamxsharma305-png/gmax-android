/**
 * EAS / local: ensure assets/icon.png is the GMAX app icon.
 * Prefers embedded user icon; falls back to download URL then solid color.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const zlib = require("zlib");

const ICON_URL = "https://i.postimg.cc/prCsgYtQ/me-(1).png";

// Base64 of 1024x1024 GMAX icon (user-provided image, scaled)
const EMBEDDED_ICON_B64 = require("./icon-data.json").b64;

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function makeFallbackPng(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 4;
      row[i] = 5;
      row[i + 1] = 7;
      row[i + 2] = 7;
      row[i + 3] = 255;
    }
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function download(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "GMAX-EAS/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function main() {
  const dir = path.join(__dirname, "..", "assets");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "icon.png");

  // Skip if a real icon already exists (>5KB)
  try {
    if (fs.existsSync(out) && fs.statSync(out).size > 5000) {
      console.log("[ensure-icon] keeping existing", out, fs.statSync(out).size);
      return;
    }
  } catch (_) {}

  // 1) Embedded user icon
  try {
    const buf = Buffer.from(EMBEDDED_ICON_B64, "base64");
    if (buf.length > 1000 && buf[0] === 0x89 && buf[1] === 0x50) {
      fs.writeFileSync(out, buf);
      console.log("[ensure-icon] wrote embedded icon", out, buf.length, "bytes");
      return;
    }
  } catch (e) {
    console.warn("[ensure-icon] embedded failed", e.message);
  }

  // 2) Download
  try {
    const buf = await download(ICON_URL);
    if (buf.length > 500 && buf[0] === 0x89) {
      fs.writeFileSync(out, buf);
      console.log("[ensure-icon] wrote downloaded icon", out, buf.length, "bytes");
      return;
    }
  } catch (e) {
    console.warn("[ensure-icon] download failed", e.message);
  }

  // 3) Fallback
  const png = makeFallbackPng(1024);
  fs.writeFileSync(out, png);
  console.log("[ensure-icon] wrote fallback", out, png.length, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(0);
});
