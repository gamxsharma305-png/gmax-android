// Disabled: injecting JitPack into settings.gradle breaks Expo module
// resolution on Gradle 9 (PREFER_SETTINGS) — expo AARs stop resolving and
// Gradle falls through to jitpack.io with 401.
// NewPipe was removed from note-native; YouTube streams use JS endpoints.
module.exports = (config) => config;
