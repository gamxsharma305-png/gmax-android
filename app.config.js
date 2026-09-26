const fs = require("fs");
const path = require("path");

try {
  const dir = path.join(__dirname, "assets");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "icon.png");
  if (!fs.existsSync(p) || fs.statSync(p).size < 100) {
    const minimal = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    fs.writeFileSync(p, minimal);
  }
} catch (e) {}

module.exports = {
  name: "GMAX",
  slug: "gmax",
  owner: "gmax519",
  version: "1.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  backgroundColor: "#050707",
  splash: { backgroundColor: "#050707", resizeMode: "contain", image: "./assets/icon.png" },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.gmax.player",
    infoPlist: { UIBackgroundModes: ["audio"] },
  },
  android: {
    package: "com.gmax.player",
    versionCode: 19,
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#050707",
    },
    permissions: [
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "WAKE_LOCK",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
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
    "./plugins/withAndroidAbis",
    "./plugins/withReleaseSigning",
  ],
  extra: {
    eas: {
      projectId: "d0b9f8bc-3fe4-48a4-97b8-52a2476cd528",
    },
  },
};
