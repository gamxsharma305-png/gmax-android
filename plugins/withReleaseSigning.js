const { withAppBuildGradle } = require('expo/config-plugins');

/** Keep debug keystore for preview APKs when no release keystore is configured. */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('signingConfig signingConfigs.debug') && contents.includes('buildTypes')) {
      contents = contents.replace(
        /release\s*\{([^}]*)\}/,
        (match, body) => {
          if (body.includes('signingConfig')) return match;
          return `release {${body}\n            signingConfig signingConfigs.debug\n        }`;
        },
      );
    }
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withReleaseSigning;
