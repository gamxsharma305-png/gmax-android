const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/** Solid #050707 PNG so native splash is never white. */
function makeDarkPng(size) {
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

try {
  const dir = path.join(__dirname, "assets");
  fs.mkdirSync(dir, { recursive: true });

  // Always ensure a pure-dark splash (kills white flash before JS GSplash)
  const splashPath = path.join(dir, "splash.png");
  if (!fs.existsSync(splashPath) || fs.statSync(splashPath).size < 100) {
    fs.writeFileSync(splashPath, makeDarkPng(512));
  }

  const iconPath = path.join(dir, "icon.png");
  if (!fs.existsSync(iconPath) || fs.statSync(iconPath).size < 100) {
    fs.writeFileSync(iconPath, makeDarkPng(1024));
  }
} catch (e) {}

module.exports = {
  name: "GMAX",
  slug: "gmax",
  owner: "gmax519",
  version: "1.1.1",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  backgroundColor: "#050707",
  // Native splash = solid dark only. GMAX draw animation starts in JS (GSplash).
  splash: {
    backgroundColor: "#050707",
    resizeMode: "contain",
    image: "./assets/splash.png",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.gmax.player",
    infoPlist: { UIBackgroundModes: ["audio"] },
  },
  android: {
    package: "com.gmax.player",
    versionCode: 26,
    backgroundColor: "#050707",
    adaptiveIcon: {
      // Padded icon from ensure-icon.js (safe zone) — not full-bleed zoom
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#050707",
    },
    permissions: [
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "WAKE_LOCK",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "POST_NOTIFICATIONS",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.POST_NOTIFICATIONS",
    ],
  },
  plugins: [
    "expo-font",
    [
      "expo-audio",
      {
        enableBackgroundPlayback: true,
        recordAudioAndroid: false,
      },
    ],
    "expo-asset",
    "./plugins/withCoreLibraryDesugaring",
    "./plugins/withJitpack",
    "./plugins/withAndroidAbis",
    "./plugins/withReleaseSigning",
  ],
  extra: {
    eas: {
      projectId: "d0b9f8bc-3fe4-48a4-97b8-52a2476cd528",
    },
  },
};
