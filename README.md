# GMAX Android

Expo (React Native) music app — **Saavn + Audius + YouTube** with **lock-screen / background** audio.

| Source | Background |
|--------|------------|
| Saavn / Audius | Yes (`expo-av`) |
| **YouTube** | Yes — audio URL resolve → `expo-av` (same as other streams). Embed only if resolve fails. |

---

## Phone se APK banana (sirf mobile — computer nahi chahiye)

### Method A — Expo website (sabse aasaan)

1. Phone browser me kholo: [https://expo.dev](https://expo.dev) → **Sign up / Log in** (Google se bhi ho sakta hai).
2. **Create a project** → import / connect **GitHub** repo: `gamxsharma305-png/gmax-android`.
3. Project open karke **Builds** → **Create a build**.
4. Platform: **Android** · Profile: **preview** (APK).
5. Build 10–20 min me complete hota hai → **Download** APK → phone me install.

> Pehli baar Expo account free tier se Android APK milta hai.

### Method B — Laptop / PC (agar baad me mile)

```bash
git clone https://github.com/gamxsharma305-png/gmax-android.git
cd gmax-android
npm install
npm i -g eas-cli
eas login
eas build -p android --profile preview
```

Link se APK download → phone pe install.

### Install tip

Android: **Settings → Security → Unknown sources / Install unknown apps** allow karo for your browser/Files app.

### Icon

Agar build me `assets/icon.png` missing error aaye: koi bhi 512×512 PNG ko `assets/icon.png` naam se repo me add karo (GitHub app se phone pe bhi upload ho sakta hai).

---

## Dev test (optional)

```bash
npm install
npx expo start
```

Phone pe **Expo Go** → QR scan.  
**Note:** Background audio poora tab test karo jab **APK** install ho (Expo Go limited hota hai).

---

## Project structure

```
App.tsx                     # UI + play logic
src/api/music.ts            # Search + resolveYouTubeStream()
src/player/audio.ts         # expo-av background player
src/player/YouTubeEmbed.tsx # fallback embed only
app.json / eas.json         # permissions + APK profile
```

---

## YouTube background kaise kaam karta hai

1. Search Invidious se video list laata hai.
2. Play pe `resolveYouTubeStream(videoId)` audio URL nikalta hai.
3. Woh URL `expo-av` se play hoti hai → **screen off / dusri app** pe bhi chalti rehti hai.
4. Agar resolve fail ho → purana iframe embed (background weak).

Player me **YT · BG** dikhe to stream mode active hai.

---

## Legal

Public proxies / mirrors change ho sakte hain. Official YouTube app policies apply; personal use ke liye design kiya gaya hai.
