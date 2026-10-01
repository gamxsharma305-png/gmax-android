/**
 * EAS / local:
 *  - assets/splash.png  → solid #050707 (no white flash before GSplash)
 *  - assets/icon.png    → user photo centered at ~55% on dark canvas
 *    so Android adaptive icon does not crop/zoom the face.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
const { execSync } = require("child_process");

const ICON_URL = "https://i.postimg.cc/prCsgYtQ/me-(1).png";
const OUT_SIZE = 1024;
const CONTENT_RATIO = 0.55; // tighter safe zone — less zoom on launcher

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

function makeSolidPng(size, r = 5, g = 7, b = 7) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 4;
      row[i] = r;
      row[i + 1] = g;
      row[i + 2] = b;
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

function ensureSharp() {
  try {
    require.resolve("sharp");
    return true;
  } catch {
    try {
      execSync("npm install sharp --no-save --prefer-offline", {
        stdio: "ignore",
        timeout: 120000,
      });
      return true;
    } catch {
      return false;
    }
  }
}

async function writePaddedIcon(srcBuf, outPath) {
  if (!ensureSharp()) {
    fs.writeFileSync(outPath, srcBuf);
    console.log("[ensure-icon] wrote original icon (no sharp)", outPath, srcBuf.length);
    return false;
  }

  const sharp = require("sharp");
  const content = Math.round(OUT_SIZE * CONTENT_RATIO);
  const padded = await sharp({
    create: {
      width: OUT_SIZE,
      height: OUT_SIZE,
      channels: 3,
      background: { r: 5, g: 7, b: 7 },
    },
  })
    .composite([
      {
        input: await sharp(srcBuf)
          .resize(content, content, { fit: "cover" })
          .png()
          .toBuffer(),
        top: Math.round((OUT_SIZE - content) / 2),
        left: Math.round((OUT_SIZE - content) / 2),
      },
    ])
    .png()
    .toBuffer();

  fs.writeFileSync(outPath, padded);
  console.log("[ensure-icon] wrote padded icon", outPath, padded.length, "bytes", "ratio", CONTENT_RATIO);
  return true;
}

async function main() {
  const dir = path.join(__dirname, "..", "assets");
  fs.mkdirSync(dir, { recursive: true });

  const splashPath = path.join(dir, "splash.png");
  fs.writeFileSync(splashPath, makeSolidPng(512));
  console.log("[ensure-icon] wrote dark splash", splashPath);

  const iconPath = path.join(dir, "icon.png");
  try {
    const buf = await download(ICON_URL);
    if (buf.length > 500 && buf[0] === 0x89 && buf[1] === 0x50) {
      await writePaddedIcon(buf, iconPath);
      return;
    }
    console.warn("[ensure-icon] download not a valid PNG, length=", buf.length);
  } catch (e) {
    console.warn("[ensure-icon] download failed:", e.message);
  }

  fs.writeFileSync(iconPath, makeSolidPng(OUT_SIZE));
  console.log("[ensure-icon] wrote fallback dark icon", iconPath);
}

main().catch((e) => {
  console.error("[ensure-icon]", e);
  process.exit(0);
});
