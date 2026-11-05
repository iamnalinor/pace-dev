import type { ExpoConfig } from "expo/config";

import { type AndroidConfig, withAndroidManifest } from "expo/config-plugins";

// Expo's XML model omits provider although Android's manifest supports it.
type RuntimeManifest = AndroidConfig.Manifest.AndroidManifest & {
  readonly manifest: {
    readonly application?: (AndroidConfig.Manifest.ManifestApplication & {
      provider?: {
        readonly $: { readonly "android:name": string; readonly "tools:node"?: string };
      }[];
    })[];
  };
};

const PROVIDER = "com.google.firebase.provider.FirebaseInitProvider";
const MODE_KEY = "pace.firebaseMode";

/** Applied only to explicit runtime candidates; baked releases retain Google's provider. */
export const configureRuntimeFirebaseManifest = (manifest: RuntimeManifest): RuntimeManifest => {
  const [application, ...otherApplications] = manifest.manifest.application ?? [];
  if (application === undefined) {
    throw new Error("Android application manifest is missing");
  }
  const provider = [
    ...(application.provider ?? []).filter((provider) => provider.$["android:name"] !== PROVIDER),
    { $: { "android:name": PROVIDER, "tools:node": "remove" } },
  ];
  const metadata = [
    ...(application["meta-data"] ?? []).filter((entry) => entry.$["android:name"] !== MODE_KEY),
    { $: { "android:name": MODE_KEY, "android:value": "runtime" } },
  ];
  return {
    ...manifest,
    manifest: {
      ...manifest.manifest,
      $: { ...manifest.manifest.$, "xmlns:tools": "http://schemas.android.com/tools" },
      application: [{ ...application, provider, "meta-data": metadata }, ...otherApplications],
    },
  };
};

export const withRuntimeFirebase = (config: ExpoConfig): ExpoConfig =>
  withAndroidManifest(config, (mod) => ({
    ...mod,
    modResults: configureRuntimeFirebaseManifest(mod.modResults),
  }));
