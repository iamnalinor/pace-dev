import { configureRuntimeFirebaseManifest } from "./runtime-firebase-plugin.ts";

describe("runtime Firebase manifest", () => {
  it("removes automatic Firebase initialization and declares runtime mode without losing other entries", () => {
    const manifest = {
      manifest: {
        $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
        queries: [],
        application: [
          {
            $: { "android:name": ".MainApplication" },
            provider: [{ $: { "android:name": "other.Provider", "android:authorities": "other" } }],
            "meta-data": [{ $: { "android:name": "other", "android:value": "kept" } }],
          },
        ],
      },
    };
    const result = configureRuntimeFirebaseManifest(manifest);
    expect(result.manifest.$["xmlns:tools"]).toBe("http://schemas.android.com/tools");
    expect(result.manifest.application?.[0]?.provider).toEqual([
      { $: { "android:name": "other.Provider", "android:authorities": "other" } },
      {
        $: {
          "android:name": "com.google.firebase.provider.FirebaseInitProvider",
          "tools:node": "remove",
        },
      },
    ]);
    expect(result.manifest.application?.[0]?.["meta-data"]).toEqual([
      { $: { "android:name": "other", "android:value": "kept" } },
      { $: { "android:name": "pace.firebaseMode", "android:value": "runtime" } },
    ]);
    const repeated = configureRuntimeFirebaseManifest(result);
    expect(repeated.manifest.application?.[0]?.provider).toHaveLength(2);
    expect(repeated.manifest.application?.[0]?.["meta-data"]).toHaveLength(2);
  });
});
