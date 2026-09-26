const {
  withSettingsGradle,
  createRunOncePlugin,
} = require('expo/config-plugins');

/**
 * JitPack restricted to NewPipe only — never query jitpack for expo.modules.*.
 * Use includeGroup (double-quoted) — includeGroupByRegex + \\ breaks Groovy parser.
 */
const JITPACK_BLOCK = `
        // GMAX: NewPipeExtractor ONLY — do not resolve expo.modules.* from JitPack
        maven {
            url "https://jitpack.io"
            content {
                includeGroup "com.github.TeamNewPipe"
            }
        }
`;

function stripExistingJitpack(contents) {
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

module.exports = createRunOncePlugin(withJitpack, 'withJitpack', '3.1.0');
