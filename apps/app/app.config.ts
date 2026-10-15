import type { ExpoConfig } from "expo/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { appVersion } from "./app-version.ts";
import { firebaseProjectOf } from "./firebase-project.ts";

// Expo types `process.env` loosely (EXPO_PUBLIC_* are injected at bundle time): narrow it here.
const envString = (name: string): string | undefined => {
  const value: unknown = process.env[name];
  return typeof value === "string" ? value : undefined;
};

/** `git <args>`'s output, empty without git (or tags). */
const git = (args: readonly string[]): string => {
  try {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the build machine's git (Node runs this config at prebuild); fixed arguments, no input
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

/** The last release tag, the commits since it and the commit. */
const describe = git(["describe", "--tags", "--long", "--match", "v*"]);
const tag = describe.replace(/-\d+-g[0-9a-f]+$/u, "");
/** A commit's committer time in seconds (0 when unknown). */
const committedAt = (ref: string): number => {
  const seconds = Number(git(["log", "-1", "--format=%ct", ref]));
  return Number.isFinite(seconds) ? seconds : 0;
};

// Release builds are tagged vX.Y.Z; PACE_RELEASE_TAG is set by release.yml (a run by hand
// releases from a branch, not a tag ref). Any other build sits on the last tag (app-version.ts).
const { version, versionCode } = appVersion({
  describe,
  hoursSinceTag: tag === "" ? 0 : (committedAt("HEAD") - committedAt(tag)) / 3600,
  releaseTag: envString("PACE_RELEASE_TAG") ?? envString("GITHUB_REF_NAME") ?? "",
});

/** The Firebase config file, when the build has one (see release.yml). */
const GOOGLE_SERVICES_FILE = envString("GOOGLE_SERVICES_FILE");

/** The Firebase project that file is for: the app compares it with the server's. */
const firebaseProject = (() => {
  if (GOOGLE_SERVICES_FILE === undefined) {
    return null;
  }
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the build's own Firebase file, named by release.yml
    return firebaseProjectOf(JSON.parse(readFileSync(GOOGLE_SERVICES_FILE, "utf8")) as unknown);
  } catch {
    return null;
  }
})();

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
    // Firebase (push through FCM): the file release.yml writes from a secret; without it the
    // build has no Google push and the phone polls instead.
    ...(GOOGLE_SERVICES_FILE !== undefined && { googleServicesFile: GOOGLE_SERVICES_FILE }),
    versionCode,
    adaptiveIcon: {
      backgroundColor: "#0b0b0c",
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/adaptive-icon-mono.png",
    },
    permissions: ["android.permission.READ_CALENDAR", "android.permission.POST_NOTIFICATIONS"],
    // Reminders are plain notifications: a few minutes late in Doze is fine, no alarm access.
    blockedPermissions: [
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_EXACT_ALARM",
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
                  path: "./node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf",
                  weight: 400,
                },
                {
                  path: "./node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf",
                  weight: 500,
                },
                {
                  path: "./node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf",
                  weight: 600,
                },
                {
                  path: "./node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf",
                  weight: 700,
                },
              ],
              fontFamily: "Inter",
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
    [
      "expo-build-properties",
      {
        // The release APK without these is ~50 MB: every class of every library stays (all of
        // Jetpack Compose among them, which expo-router links through @expo/ui) and native
        // libraries are stored uncompressed. R8 keeps what is used; compressed libraries are
        // unpacked once at install, which trades some storage for a smaller download.
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // Android 11+ hides other apps unless asked: lets login see whether tg:// opens Telegram.
          manifestQueries: {
            intent: [{ action: "android.intent.action.VIEW", data: { scheme: "tg" } }],
          },
          useLegacyPackaging: true,
        },
      },
    ],
    "./plugins/with-release-signing.js",
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
    // FCM works only with a server sending with this same project (`src/platform/notifications.ts`).
    firebaseProject,
  },
};

export default config;
