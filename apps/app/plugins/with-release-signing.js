const { withAppBuildGradle } = require("expo/config-plugins");

// Expo's template signs `release` with the debug keystore. This plugin adds a `release`
// signing config fed by Gradle properties (ORG_GRADLE_PROJECT_PACE_* in CI) and keeps the
// committed debug keystore as the fallback, so every build installs over the previous one.
const DEBUG_CONFIG = /signingConfigs\s*\{\s*debug\s*\{[^}]*\}\s*\n/;
const RELEASE_ANCHOR = "signingConfig signingConfigs.debug";

const RELEASE_CONFIG = `        release {
            if (findProperty('PACE_STORE_FILE')) {
                storeFile file(findProperty('PACE_STORE_FILE'))
                storePassword findProperty('PACE_STORE_PASSWORD')
                keyAlias findProperty('PACE_KEY_ALIAS')
                keyPassword findProperty('PACE_KEY_PASSWORD')
            } else {
                storeFile file('../../keystores/debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    const gradle = c.modResults.contents;
    const debugBlock = DEBUG_CONFIG.exec(gradle);
    if (debugBlock === null || !gradle.includes(RELEASE_ANCHOR)) {
      throw new Error(
        "with-release-signing: the Expo build.gradle template changed, update the anchors",
      );
    }
    const withRelease = gradle.replace(debugBlock[0], () => `${debugBlock[0]}${RELEASE_CONFIG}`);
    const contents = withRelease.replace(
      RELEASE_ANCHOR,
      () => "signingConfig signingConfigs.release",
    );
    return { ...c, modResults: { ...c.modResults, contents } };
  });
};
