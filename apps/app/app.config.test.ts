import type { ExpoConfig } from "expo/config";

import { ANDROID_SMOKE_API_URL } from "./android-smoke.ts";
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

const configFor = (
  apiUrl: string,
  devLogin: string,
  firebaseMode?: string,
): ExpoConfig | undefined => {
  const restore = jest.replaceProperty(process, "env", {
    ...process.env,
    EXPO_PUBLIC_API_URL: apiUrl,
    EXPO_PUBLIC_DEV_LOGIN: devLogin,
    EXPO_PUBLIC_FIREBASE_MODE: firebaseMode,
    EXPO_PUBLIC_WEB_ORIGIN: "https://pace.nalinor.dev",
    GOOGLE_SERVICES_FILE: "./google-services.json",
  });
  try {
    let result: ExpoConfig | undefined;
    jest.isolateModules(() => {
      result = jest.requireActual<{ readonly default: ExpoConfig }>("./app.config.ts").default;
    });
    return result;
  } finally {
    restore.restore();
  }
};

describe("Android smoke app config", () => {
  const plugin = "./plugins/with-emulator-network.js";

  it("adds the emulator-only network plugin and separate app id for the opted-in test APK", () => {
    const testConfig = configFor(ANDROID_SMOKE_API_URL, "1");
    expect(testConfig?.android?.package).toBe("dev.nalinor.pace.e2e");
    expect(testConfig?.android?.intentFilters).toBeUndefined();
    expect(testConfig?.android?.googleServicesFile).toBeUndefined();
    expect(testConfig?.plugins).toContain(plugin);
    expect(testConfig?.extra).toMatchObject({
      apiUrl: ANDROID_SMOKE_API_URL,
      botUsername: "PaceAndroidSmokeBot",
      isDevLogin: true,
      webOrigin: ANDROID_SMOKE_API_URL,
    });
  });

  it.each([
    [ANDROID_SMOKE_API_URL, ""],
    [ANDROID_SMOKE_API_URL.replace("8787", "8888"), "1"],
    ["https://pace-api.nalinor.dev", "1"],
    ["http://localhost:8787", "1"],
  ])("keeps the regular manifest for %s with dev login flag %s", (apiUrl, devLogin) => {
    const other = configFor(apiUrl, devLogin);
    expect(other?.android?.package).toBe("dev.nalinor.pace");
    expect(other?.android?.intentFilters).toHaveLength(2);
    expect(other?.plugins).not.toContain(plugin);
  });
});

describe("Firebase build mode", () => {
  it("preserves baked configuration by default", () => {
    const baked = configFor("https://pace-api.nalinor.dev", "");
    expect(baked?.android?.googleServicesFile).toBe("./google-services.json");
    expect(baked?.extra).toHaveProperty("firebaseProject");
    expect(baked?.extra?.["firebaseMode"]).toBe("baked");
  });

  it("omits baked Firebase configuration only for an explicit runtime candidate", () => {
    const runtime = configFor("https://pace-api.nalinor.dev", "", "runtime");
    expect(runtime?.android?.googleServicesFile).toBeUndefined();
    expect(runtime?.extra).not.toHaveProperty("firebaseProject");
    expect(runtime?.extra?.["firebaseMode"]).toBe("runtime");
  });

  it("refuses unknown supplied modes rather than silently baking a candidate", () => {
    expect(() => configFor("https://pace-api.nalinor.dev", "", "runtim")).toThrow(
      "Invalid Firebase build mode",
    );
  });
});
