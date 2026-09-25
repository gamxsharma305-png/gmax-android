const { withSettingsGradle } = require('expo/config-plugins');

/**
 * NewPipeExtractor is published on JitPack.
 *
 * IMPORTANT (Gradle 8+/Expo SDK 52+):
 * - Only add JitPack inside the EXISTING dependencyResolutionManagement.repositories
 *   block in settings.gradle (next to google() / mavenCentral()).
 * - NEVER create an allprojects { repositories { jitpack } } with only JitPack.
 *   That makes Gradle ignore settings repos and try to download expo modules from
 *   jitpack.io → 401 Unauthorized / Could not resolve host.exp.exponent:...
 */
function withJitpack(config) {
  return withSettingsGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (contents.includes('jitpack.io')) {
      return cfg;
    }

    if (contents.includes('dependencyResolutionManagement')) {
      // Insert into the repositories { } that belongs to dependencyResolutionManagement
      contents = contents.replace(
        /(dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{)/,
        "$1\n        maven { url 'https://www.jitpack.io' }",
      );
    } else {
      // Very old template — still never use allprojects-only-jitpack
      contents +=
        "\n\ndependencyResolutionManagement {\n" +
        "    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)\n" +
        "    repositories {\n" +
        "        google()\n" +
        "        mavenCentral()\n" +
        "        maven { url 'https://www.jitpack.io' }\n" +
        "    }\n" +
        "}\n";
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withJitpack;
