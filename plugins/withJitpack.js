const {
  withProjectBuildGradle,
  withSettingsGradle,
} = require('expo/config-plugins');

const JITPACK = "maven { url 'https://www.jitpack.io' }";

function injectJitpack(contents) {
  if (contents.includes('jitpack.io')) return contents;
  if (contents.includes('dependencyResolutionManagement')) {
    return contents.replace(
      /repositories\s*\{/,
      `repositories {\n        ${JITPACK}`,
    );
  }
  if (contents.includes('allprojects')) {
    return contents.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      `allprojects {\n    repositories {\n        ${JITPACK}`,
    );
  }
  return contents + `\nallprojects {\n  repositories {\n    ${JITPACK}\n  }\n}\n`;
}

function withJitpack(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    cfg.modResults.contents = injectJitpack(cfg.modResults.contents);
    return cfg;
  });
  config = withSettingsGradle(config, (cfg) => {
    cfg.modResults.contents = injectJitpack(cfg.modResults.contents);
    return cfg;
  });
  return config;
}

module.exports = withJitpack;
