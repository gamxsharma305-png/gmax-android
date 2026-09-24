# GMAX Android APK

**Full 1:1 clone of the GMAX website** inside a native Android shell.

The app opens your live site in a full-screen WebView:

**https://gmax-website-seven.vercel.app**

Same UI, search, player, settings, queue — whatever is on the website appears in the APK. No separate simplified player.

---

## Build APK (Expo)

1. Connect this GitHub repo to Expo project **gmax** (account **gmax519**).
2. Project ID is already in `app.config.js`.
3. Expo → **Builds** → **preview** (Android APK).

Or:

```bash
npm install
eas build -p android --profile preview
```

---

## Background audio note

The website’s own player + MediaSession run inside the WebView.  
Android may still pause WebView media when the app is fully killed; keeping the app in recent apps / not force-stopping helps.  
Battery: set GMAX to **Unrestricted** in system settings for best results.

---

## Change the site URL

Edit `SITE_URL` in `App.tsx` if the Vercel domain changes.
