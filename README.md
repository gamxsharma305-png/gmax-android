# GMAX Android (Native)

Native **GMAX** music app — **Expo (React Native)**.

Saavn + Audius **direct streams** (true background / lock-screen audio via `expo-av`)  
+ **YouTube** search & in-app play (official embed via `react-native-youtube-iframe`).

> Website repo is separate. This repo is only for the Android app / APK.

---

## Features

| Feature | Notes |
|---------|--------|
| Search | JioSaavn + Audius + YouTube (Invidious) |
| Background audio | Saavn / Audius streams — screen off OK |
| YouTube | In-app embed; may pause when app fully backgrounded (YouTube policy) |
| Queue | Next / previous from search results |
| Progress | Seek bar for stream tracks |
| Dark UI | GMAX `#050707` theme |

---

## Requirements

- Node.js 20+
- Android phone **or** emulator
- For APK: Expo account + [EAS](https://expo.dev)

---

## Setup (dev)

```bash
git clone https://github.com/gamxsharma305-png/gmax-android.git
cd gmax-android
npm install
npx expo start
```

Install **Expo Go** on phone → scan QR.

### Local native build

```bash
npx expo prebuild --platform android
npx expo run:android
```

---

## Build APK (recommended)

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview
```

Download the APK from the Expo dashboard link when the build finishes.

Profiles (`eas.json`):

- `preview` → **APK** (install on device)
- `production` → **AAB** (Play Store)

---

## Project structure

```
App.tsx                     # Search + player UI
src/api/music.ts            # Saavn + Audius + YouTube search
src/player/audio.ts         # expo-av background streams
src/player/YouTubeEmbed.tsx # YouTube iframe player
app.json                    # Package id, permissions
eas.json                    # APK / AAB profiles
```

---

## Background audio notes

- **Saavn / Audius**: `expo-av` + `staysActiveInBackground` + Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK` → works with screen off.
- **YouTube**: played with the official embed. Android often stops embed audio when the app is not visible. Prefer Saavn/Audius when you need lock-screen listening.

---

## Legal

Use lawful stream sources only. YouTube is played via official embed (no stream ripping in this app).
