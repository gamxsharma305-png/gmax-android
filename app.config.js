/**
 * Runs on EAS when config is read — creates assets/icon.png BEFORE prebuild.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

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

function makePng(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 4;
      const cx = x - size / 2;
      const cy = y - size / 2;
      const mark =
        Math.abs(cx) < size * 0.22 &&
        Math.abs(cy) < size * 0.22 &&
        (Math.abs(cx) > size * 0.14 ||
          Math.abs(cy) > size * 0.14 ||
          (Math.abs(cx) < size * 0.08 && Math.abs(cy) < size * 0.08));
      if (mark) {
        row[i] = 245; row[i + 1] = 245; row[i + 2] = 245; row[i + 3] = 255;
      } else {
        row[i] = 5; row[i + 1] = 7; row[i + 2] = 7; row[i + 3] = 255;
      }
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

try {
  const dir = path.join(__dirname, "assets");
  fs.mkdirSync(dir, { recursive: true });
  const iconPath = path.join(dir, "icon.png");
  if (!fs.existsSync(iconPath) || fs.statSync(iconPath).size < 100) {
    fs.writeFileSync(iconPath, makePng(1024));
    console.log("[app.config] wrote", iconPath);
  }
} catch (e) {
  console.warn("[app.config] icon gen failed", e.message);
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "GMAX",
  slug: "gmax",
  owner: "gmax519",
  version: "2.0.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  splash: {
    backgroundColor: "#050707",
    resizeMode: "contain",
  },
  android: {
    package: "com.gmax.player",
    versionCode: 6,
    permissions: [
      "WAKE_LOCK",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "INTERNET",
      "ACCESS_NETWORK_STATE",
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#050707",
    },
  },
  ios: {
    bundleIdentifier: "com.gmax.player",
    infoPlist: {
      UIBackgroundModes: ["audio"],
    },
  },
  plugins: [],
  extra: {
    eas: {
      projectId: "d0b9f8bc-3fe4-48a4-97b8-52a2476cd528",
    },
  },
  doctor: {
    reactNativeDirectoryCheck: {
      exclude: ["react-native-webview"],
      listUnknownPackages: false,
    },
  },
};
