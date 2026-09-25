const {
  withProjectBuildGradle,
  withSettingsGradle,
} = require('expo/config-plugins');

const JITPACK_LINE = "maven { url 'https://www.jitpack.io' }";

/**
 * Expo SDK 52+ / Gradle 8+ uses dependencyResolutionManagement in settings.gradle.
 * `allprojects {}` is NOT valid on Settings — injecting it crashes evaluation:
 *   Could not find method allprojects() on settings 'GMAX'
 */
function injectIntoSettings(contents) {
  if (contents.includes('jitpack.io')) return contents;

  // Preferred: inside dependencyResolutionManagement { repositories { ... } }
  if (contents.includes('dependencyResolutionManagement')) {
    // Only touch the repositories block that follows dependencyResolutionManagement
    return contents.replace(
      /(dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{)/,
      `$1\n        ${JITPACK_LINE}`,
    );
  }

  // Fallback: append a proper settings repositories block (not allprojects)
  return (
    contents +
    `\n\ndependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)\n    repositories {\n        google()\n        mavenCentral()\n        ${JITPACK_LINE}\n    }\n}\n`
  );
}

function injectIntoRootBuildGradle(contents) {
  if (contents.includes('jitpack.io')) return contents;

  // Classic allprojects { repositories { } } in root build.gradle is fine
  if (/allprojects\s*\{\s*repositories\s*\{/.test(contents)) {
    return contents.replace(
      /(allprojects\s*\{\s*repositories\s*\{)/,
      `$1\n        ${JITPACK_LINE}`,
    );
  }

  // buildscript repositories only — add allprojects repos for project deps
  return (
    contents +
    `\n\nallprojects {\n    repositories {\n        ${JITPACK_LINE}\n    }\n}\n`
  );
}

function withJitpack(config) {
  config = withSettingsGradle(config, (cfg) => {
    cfg.modResults.contents = injectIntoSettings(cfg.modResults.contents);
    return cfg;
  });
  config = withProjectBuildGradle(config, (cfg) => {
    cfg.modResults.contents = injectIntoRootBuildGradle(cfg.modResults.contents);
    return cfg;
  });
  return config;
}

module.exports = withJitpack;
