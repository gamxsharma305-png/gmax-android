# GMAX Android (Native)

**React Native / Expo** port of the GMAX music website structure — **not a WebView**.

Same architecture as `gmax-website`:

```
Shell
 ├─ Home / Search / History / Library
 ├─ MiniPlayer
 ├─ NowPlaying (overlay)
 └─ Settings (overlay)

lib/gmax: types, search (Saavn+Audius+YouTube), engine (expo-av)
store: player, ui (Zustand)
```

## Background audio

`expo-av` + `staysActiveInBackground` + Android media playback foreground service.

## Build APK

Expo → **preview** profile, or `eas build -p android --profile preview`.
