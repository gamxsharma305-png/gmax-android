# GMAX Android (Native)

Native music app for **GMAX** using **Expo (React Native)**.

## Why native?

Website / PWA cannot keep YouTube iframe audio reliably on the Android home screen.
This app uses **HTML5-style stream URLs** (Saavn + Audius) with **Expo AV + background audio mode**, so playback can continue when the screen is off or you switch apps.

### Sources (background-capable)

| Source | Content | Background |
|--------|---------|------------|
| **JioSaavn API** | Indian / Bollywood / Punjabi | Yes (direct stream URL) |
| **Audius** | Phonk, lofi, electronic, indie | Yes (official stream API) |

**Not included:** YouTube / YT Music stream extraction (against YouTube ToS). Use official YouTube / YT Music apps for that catalog.

---

## Requirements

- Node.js 20+
- Android Studio (SDK + emulator) **or** a physical Android phone
- Expo CLI (`npx expo`)

---

## Setup

```bash
git clone https://github.com/gamxsharma305-png/gmax-android.git
cd gmax-android
npm install
npx expo start
```

Phone: install **Expo Go**, scan QR.

### Build APK (development)

```bash
npx expo prebuild --platform android
npx expo run:android
```

### Production APK / AAB (EAS)

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview
```

See [Expo EAS Build](https://docs.expo.dev/build/introduction/).

---

## Background audio (Android)

Configured in `app.json`:

- `UIBackgroundModes` / Android audio focus via `expo-av`
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `android.permission.WAKE_LOCK`

Player uses `Audio.setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true })`.

---

## Project structure

```
App.tsx              # UI: search + player
src/api/music.ts     # Saavn + Audius search/resolve
src/player/audio.ts  # expo-av background player
app.json             # Android permissions
package.json
```

---

## Legal note

Use only sources that provide lawful stream URLs for third-party clients.
Do not add YouTube downloaders / extractors to this project.
