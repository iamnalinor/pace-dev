import config from "./app.config.ts";
import { THEME_VARS } from "./src/ui/generated/tokens.ts";

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

  // The native grounds (first frame, splash, adaptive icon) are the tokens' dark app ground, as the
  // web page's (F-WEB-02): no hand-typed hex that drifts when the palette changes.
  it("paints the splash, the adaptive icon and the first frame with the tokens' app ground", () => {
    const ground = THEME_VARS.dark["--pace-app"];
    expect(config.backgroundColor).toBe(ground);
    expect(config.android?.adaptiveIcon?.backgroundColor).toBe(ground);
    expect(pluginOptions("expo-splash-screen")).toMatchObject({ backgroundColor: ground });
  });
});
