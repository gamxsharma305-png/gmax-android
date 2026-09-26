/**
 * EAS / local: write assets/icon.png from the GMAX user icon URL.
 * Falls back to a solid dark square only if download fails.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const zlib = require("zlib");

const ICON_URL = "https://i.postimg.cc/prCsgYtQ/me-(1).png";

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

function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 GMAX-EAS/1.0",
          Accept: "image/png,image/*;q=0.8,*/*;q=0.5",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          download(next, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error("HTTP " + res.statusCode));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function main() {
  const dir = path.join(__dirname, "..", "assets");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "icon.png");

  try {
    const buf = await download(ICON_URL);
    if (buf.length > 500 && buf[0] === 0x89 && buf[1] === 0x50) {
      fs.writeFileSync(out, buf);
      console.log("[ensure-icon] wrote user icon", out, buf.length, "bytes");
      return;
    }
    console.warn("[ensure-icon] download not a valid PNG, length=", buf.length);
  } catch (e) {
    console.warn("[ensure-icon] download failed:", e.message);
  }

  const png = makeFallbackPng(1024);
  fs.writeFileSync(out, png);
  console.log("[ensure-icon] wrote fallback", out, png.length, "bytes");
}

main().catch((e) => {
  console.error("[ensure-icon]", e);
  process.exit(0);
});
