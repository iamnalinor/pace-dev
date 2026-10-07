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

const templateChanged = () =>
  new Error("with-release-signing: the Expo build.gradle template changed, update the anchors");

/**
 * Pure transform over the generated `android/app/build.gradle` contents.
 *
 * The template references `signingConfigs.debug` twice: once in `buildTypes.debug` and once in
 * `buildTypes.release`. Only the *last* occurrence (the release build type) switches to the
 * release config; the debug build type keeps the stock debug keystore.
 *
 * @param {string} gradle
 * @returns {string}
 */
const applyReleaseSigning = (gradle) => {
  const debugBlock = DEBUG_CONFIG.exec(gradle);
  const anchorAt = gradle.lastIndexOf(RELEASE_ANCHOR);
  if (debugBlock === null || anchorAt === -1) {
    throw templateChanged();
  }
  const withRelease = gradle.replace(debugBlock[0], () => `${debugBlock[0]}${RELEASE_CONFIG}`);
  // Inserting the release block shifted the anchor; find it again in the new text.
  const releaseAt = withRelease.lastIndexOf(RELEASE_ANCHOR);
  return `${withRelease.slice(0, releaseAt)}signingConfig signingConfigs.release${withRelease.slice(releaseAt + RELEASE_ANCHOR.length)}`;
};

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => ({
    ...c,
    modResults: { ...c.modResults, contents: applyReleaseSigning(c.modResults.contents) },
  }));
};
module.exports.applyReleaseSigning = applyReleaseSigning;
