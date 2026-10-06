import type { ExpoConfig } from "expo/config";

// Expo types `process.env` loosely (EXPO_PUBLIC_* are injected at bundle time): narrow it here.
const envString = (name: string): string | undefined => {
  const value: unknown = process.env[name];
  return typeof value === "string" ? value : undefined;
};

// Release builds are tagged vX.Y.Z; the tag drives both the version and the versionCode.
const tag = /^v(\d+)\.(\d+)\.(\d+)$/.exec(envString("GITHUB_REF_NAME") ?? "");
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
  platforms: ["android"],
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  backgroundColor: "#0b0b0c",
  icon: "./assets/icon.png",
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
  ],
  // No OTA updates: releases ship as APKs through GitHub Releases.
  updates: { enabled: false },
  experiments: { typedRoutes: true },
  extra: { apiUrl: envString("EXPO_PUBLIC_API_URL") ?? "https://pace-api.nalinor.dev" },
};

export default config;
