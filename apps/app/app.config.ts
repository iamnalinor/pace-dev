import type { ExpoConfig } from "expo/config";

// Expo types `process.env` loosely (EXPO_PUBLIC_* are injected at bundle time): narrow it here.
const envString = (name: string): string | undefined => {
  const value: unknown = process.env[name];
  return typeof value === "string" ? value : undefined;
};

// Release builds are tagged vX.Y.Z; the tag drives both the version and the versionCode.
// PACE_RELEASE_TAG is set by release.yml (a run by hand releases from a branch, not a tag ref).
const tag = /^v(\d+)\.(\d+)\.(\d+)$/.exec(
  envString("PACE_RELEASE_TAG") ?? envString("GITHUB_REF_NAME") ?? "",
);
const version = tag === null ? "0.0.0" : `${tag[1]}.${tag[2]}.${tag[3]}`;
const versionCode =
  tag === null
    ? Number(envString("GITHUB_RUN_NUMBER") ?? "1")
    : Number(tag[1]) * 10_000 + Number(tag[2]) * 100 + Number(tag[3]);

const config: ExpoConfig = {
  name: "Pace",
  slug: "pace",
  version,
  scheme: "pace",
  platforms: ["android", "web"],
  // The web build is a single-page app served by the pace-web Worker (static assets).
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  backgroundColor: "#0b0b0c",
  icon: "./assets/icon.png",
  // iOS is not a target; expo-share-intent's config plugin still expects a bundle identifier.
  ios: { bundleIdentifier: "dev.nalinor.pace" },
  android: {
    package: "dev.nalinor.pace",
    versionCode,
    adaptiveIcon: {
      backgroundColor: "#0b0b0c",
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/adaptive-icon-mono.png",
    },
    permissions: [
      "android.permission.READ_CALENDAR",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.SCHEDULE_EXACT_ALARM",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [{ host: "pace.nalinor.dev", pathPrefix: "/app", scheme: "https" }],
      },
    ],
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0b0b0c",
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
      },
    ],
    [
      "expo-font",
      {
        android: {
          fonts: [
            {
              fontDefinitions: [
                {
                  path: "./node_modules/@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf",
                  weight: 400,
                },
                {
                  path: "./node_modules/@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf",
                  weight: 500,
                },
                {
                  path: "./node_modules/@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf",
                  weight: 600,
                },
                {
                  path: "./node_modules/@expo-google-fonts/geist/700Bold/Geist_700Bold.ttf",
                  weight: 700,
                },
              ],
              fontFamily: "Geist",
            },
            {
              fontDefinitions: [
                {
                  path: "./node_modules/@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf",
                  weight: 400,
                },
                {
                  path: "./node_modules/@expo-google-fonts/geist-mono/500Medium/GeistMono_500Medium.ttf",
                  weight: 500,
                },
              ],
              fontFamily: "Geist Mono",
            },
          ],
        },
      },
    ],
    [
      "expo-notifications",
      { color: "#d4ff3a", defaultChannel: "default", icon: "./assets/notification-icon.png" },
    ],
    ["expo-share-intent", { androidIntentFilters: ["text/*"] }],
    "expo-sqlite",
    "expo-calendar",
    "expo-web-browser",
    "expo-secure-store",
    "./plugins/with-release-signing.js",
    [
      "expo-build-properties",
      {
        android: {
          // R8 drops unused code (Firebase, Play Services and AndroidX are mostly unused) and
          // resources; libraries ship their own keep rules.
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // Native libraries compressed inside the APK: a much smaller download, extracted on install.
          useLegacyPackaging: true,
        },
      },
    ],
  ],
  // No OTA updates: releases ship as APKs through GitHub Releases.
  updates: { enabled: false },
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: envString("EXPO_PUBLIC_API_URL") ?? "https://pace-api.nalinor.dev",
    // The web app, opened for the browser login fallback (`src/platform/api-base.ts`).
    webOrigin: envString("EXPO_PUBLIC_WEB_ORIGIN") ?? "https://pace.nalinor.dev",
    // The bot the web login widget signs in with.
    botUsername: envString("EXPO_PUBLIC_TELEGRAM_BOT") ?? "PaceTaskTrackerBot",
    // A build made for e2e shows the dev login form (only the test Worker accepts it).
    isDevLogin: envString("EXPO_PUBLIC_DEV_LOGIN") === "1",
  },
};

export default config;
