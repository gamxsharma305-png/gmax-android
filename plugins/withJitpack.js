const {
  withSettingsGradle,
  createRunOncePlugin,
} = require('expo/config-plugins');

/**
 * Append JitPack to dependencyResolutionManagement.repositories ONLY.
 * Never touch allprojects — that broke Expo AAR resolution on Gradle 9.
 * Preserves google() / mavenCentral() that Expo already injects.
 */
function withJitpack(config) {
  return withSettingsGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (contents.includes('jitpack.io')) {
      return config;
    }

    // Prefer inserting inside an existing repositories { } under dependencyResolutionManagement
    const drmRepos =
      /dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{/;
    const match = contents.match(drmRepos);
    if (match) {
      const insertAt = match.index + match[0].length;
      const injection =
        "\n        // GMAX: NewPipeExtractor (note-native)\n" +
        "        maven { url 'https://jitpack.io' }\n";
      contents =
        contents.slice(0, insertAt) + injection + contents.slice(insertAt);
      config.modResults.contents = contents;
      return config;
    }

    // Fallback: append a minimal block (Expo usually has DRM already)
    contents +=
      "\n\n// GMAX: JitPack for NewPipeExtractor\n" +
      "dependencyResolutionManagement {\n" +
      "    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)\n" +
      "    repositories {\n" +
      "        google()\n" +
      "        mavenCentral()\n" +
      "        maven { url 'https://jitpack.io' }\n" +
      "    }\n" +
      "}\n";
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = createRunOncePlugin(withJitpack, 'withJitpack', '2.0.0');
