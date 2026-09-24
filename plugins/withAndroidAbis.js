const { withGradleProperties } = require('expo/config-plugins');

/**
 * Pins the Android ABIs the app is built for.
 */
function withAndroidAbis(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const key = 'reactNativeArchitectures';
    const value = 'armeabi-v7a,arm64-v8a,x86,x86_64';
    const existing = props.find((p) => p.type === 'property' && p.key === key);
    if (existing) existing.value = value;
    else props.push({ type: 'property', key, value });
    return config;
  });
}

module.exports = withAndroidAbis;
