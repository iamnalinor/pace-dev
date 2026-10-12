import config from "./app.config.ts";

/** The options a config plugin was given in `plugins` (`undefined` when it is not listed). */
const pluginOptions = (name: string): unknown => {
  const entry = config.plugins?.find(
    (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name,
  );
  return Array.isArray(entry) ? entry[1] : entry;
};

describe("app config", () => {
  // Without these the release APK carries every class of its libraries (Jetpack Compose among
  // them, through expo-router's @expo/ui) and stored native libraries: about 50 MB.
  it("shrinks the release APK: R8, unused resources out, native libraries compressed", () => {
    expect(pluginOptions("expo-build-properties")).toMatchObject({
      android: {
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
        useLegacyPackaging: true,
      },
    });
  });
});
