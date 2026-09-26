const {
  withSettingsGradle,
  createRunOncePlugin,
} = require('expo/config-plugins');

/**
 * JitPack maven block restricted so Gradle NEVER queries jitpack.io for
 * Expo / Google / Maven Central artifacts (that caused 401 Unauthorized).
 *
 * Only com.github.TeamNewPipe* resolves from JitPack.
 */
const JITPACK_BLOCK = `
        // GMAX: NewPipeExtractor ONLY — do not resolve expo.modules.* from JitPack
        maven {
            url 'https://jitpack.io'
            content {
                includeGroupByRegex 'com\\.github\\.TeamNewPipe.*'
            }
        }
`;

function stripExistingJitpack(contents) {
  // Remove any prior plain or content-filtered jitpack maven blocks we may have injected
  return contents
    .replace(
      /\n?\s*\/\/\s*GMAX:[^\n]*NewPipe[^\n]*\n\s*maven\s*\{[\s\S]*?url\s+['"]https?:\/\/(?:www\.)?jitpack\.io['"][\s\S]*?\n\s*\}/g,
      ''
    )
    .replace(
      /\n?\s*maven\s*\{\s*url\s+['"]https?:\/\/(?:www\.)?jitpack\.io['"]\s*\}/g,
      ''
    );
}

function withJitpack(config) {
  return withSettingsGradle(config, (config) => {
    let contents = config.modResults.contents;

    // Always re-apply a clean exclusiveContent-style block (upgrade old injections)
    contents = stripExistingJitpack(contents);

    const drmRepos =
      /dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{/;
    const match = contents.match(drmRepos);

    if (match) {
      const insertAt = match.index + match[0].length;
      contents =
        contents.slice(0, insertAt) + JITPACK_BLOCK + contents.slice(insertAt);
      config.modResults.contents = contents;
      return config;
    }

    // Fallback if Expo layout is unexpected
    contents +=
      '\n\n// GMAX: JitPack for NewPipeExtractor only\n' +
      'dependencyResolutionManagement {\n' +
      '    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)\n' +
      '    repositories {\n' +
      '        google()\n' +
      '        mavenCentral()\n' +
      JITPACK_BLOCK +
      '    }\n' +
      '}\n';
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = createRunOncePlugin(withJitpack, 'withJitpack', '3.0.0');
