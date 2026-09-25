const { withAppBuildGradle } = require('expo/config-plugins');

function withCoreLibraryDesugaring(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (
      !contents.includes('coreLibraryDesugaringEnabled') &&
      !contents.includes('isCoreLibraryDesugaringEnabled')
    ) {
      contents = contents.replace(
        /android\s*\{/,
        `android {\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }`,
      );
    }
    if (
      !contents.includes('coreLibraryDesugaring(') &&
      !contents.includes('coreLibraryDesugaring "')
    ) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")`,
      );
    }
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withCoreLibraryDesugaring;
