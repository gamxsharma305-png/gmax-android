const {
  withSettingsGradle,
  createRunOncePlugin,
} = require('expo/config-plugins');

/**
 * Expo autolinking injects project-level maven { url local AAR dirs }.
 * PREFER_SETTINGS ignores those → expo.modules.* fail to resolve.
 *
 * PREFER_PROJECT lets node_modules / local repos work, while settings still
 * lists google + mavenCentral + JitPack (NewPipe only via content filter).
 *
 * Note: RepositoriesMode.REPO_ALLOW_PROJECT does not exist in Gradle.
 * Correct mode is PREFER_PROJECT.
 */
const JITPACK_BLOCK = `
        // GMAX: NewPipeExtractor only — avoid querying JitPack for expo.modules.*
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

function forcePreferProject(contents) {
  // Any existing mode → PREFER_PROJECT so Expo local AAR repos are allowed
  if (/repositoriesMode\.set\s*\(\s*RepositoriesMode\./.test(contents)) {
    return contents.replace(
      /repositoriesMode\.set\s*\(\s*RepositoriesMode\.\w+\s*\)/g,
      'repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)'
    );
  }
  // Inject mode inside dependencyResolutionManagement if missing
  return contents.replace(
    /dependencyResolutionManagement\s*\{/,
    'dependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)'
  );
}

function withJitpack(config) {
  return withSettingsGradle(config, (config) => {
    let contents = config.modResults.contents;

    contents = stripExistingJitpack(contents);
    contents = forcePreferProject(contents);

    if (!contents.includes('jitpack.io')) {
      const drmRepos =
        /dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{/;
      const match = contents.match(drmRepos);

      if (match) {
        const insertAt = match.index + match[0].length;
        contents =
          contents.slice(0, insertAt) + JITPACK_BLOCK + contents.slice(insertAt);
      } else {
        contents +=
          '\n\n// GMAX: dependency repos\n' +
          'dependencyResolutionManagement {\n' +
          '    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)\n' +
          '    repositories {\n' +
          '        google()\n' +
          '        mavenCentral()\n' +
          JITPACK_BLOCK +
          '    }\n' +
          '}\n';
      }
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = createRunOncePlugin(withJitpack, 'withJitpack', '4.0.0');
