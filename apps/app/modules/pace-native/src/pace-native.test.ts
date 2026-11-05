import { fallbackPaceNative, PaceNative, resolvePaceNative } from "./pace-native.ts";

describe("PaceNative", () => {
  it("falls back to a module that grants nothing when the native side is missing", async () => {
    expect(PaceNative).toBe(fallbackPaceNative);
    expect(PaceNative.hasUsageAccess()).toBe(false);
    expect(PaceNative.isDndAccessGranted()).toBe(false);
    expect(PaceNative.setDnd(true)).toBe(false);
    await expect(PaceNative.queryUsageEvents(0, 1)).resolves.toEqual([]);
    await expect(PaceNative.queryUsageStats(0, 1)).resolves.toEqual([]);
    await expect(PaceNative.appLabels(["org.telegram.messenger"])).resolves.toEqual({
      "org.telegram.messenger": "org.telegram.messenger",
    });
    expect(() => {
      PaceNative.openUsageAccessSettings();
      PaceNative.openDndAccessSettings();
    }).not.toThrow();
  });

  it("treats the battery as no obstacle and has no vendor page without the native side", () => {
    // Nothing to ask on the web or in Jest: the step and the Settings hint stay hidden.
    expect(PaceNative.isIgnoringBatteryOptimizations()).toBe(true);
    expect(() => {
      PaceNative.requestIgnoreBatteryOptimizations();
    }).not.toThrow();
    expect(PaceNative.openAutostartSettings()).toBe(false);
  });

  it("uses the linked module when there is one", () => {
    const linked = { ...fallbackPaceNative, hasUsageAccess: () => true };
    expect(resolvePaceNative(linked)).toBe(linked);
    expect(resolvePaceNative(null)).toBe(fallbackPaceNative);
  });
});

describe("Firebase without the native module", () => {
  it("reports unsupported without claiming a project or accepting persisted configuration", () => {
    const unsupported = { status: "unsupported", projectId: null, reason: null };
    expect(PaceNative.firebaseStatus()).toEqual(unsupported);
    expect(PaceNative.packageName()).toBeNull();
    expect(PaceNative.stageFirebaseConfig("https://pace.test", null)).toEqual(unsupported);
    expect(PaceNative.commitFirebaseConfig("https://pace.test")).toEqual(unsupported);
    expect(PaceNative.reconcileFirebaseOrigin("https://pace.test")).toEqual(unsupported);
    expect(PaceNative.ensureFirebase("https://pace.test", null)).toEqual(unsupported);
    expect(PaceNative.restartApp()).toBe(false);
  });
});
