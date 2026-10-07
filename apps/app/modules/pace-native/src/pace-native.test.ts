import { fallbackPaceNative, PaceNative, resolvePaceNative } from "./pace-native.ts";

describe("PaceNative", () => {
  it("falls back to a module that grants nothing when the native side is missing", async () => {
    expect(PaceNative).toBe(fallbackPaceNative);
    expect(PaceNative.canScheduleExactAlarms()).toBe(false);
    expect(PaceNative.hasUsageAccess()).toBe(false);
    expect(PaceNative.isDndAccessGranted()).toBe(false);
    expect(PaceNative.setDnd(true)).toBe(false);
    await expect(PaceNative.queryUsageEvents(0, 1)).resolves.toEqual([]);
    await expect(PaceNative.queryUsageStats(0, 1)).resolves.toEqual([]);
    expect(() => {
      PaceNative.openExactAlarmSettings();
      PaceNative.openUsageAccessSettings();
      PaceNative.openDndAccessSettings();
    }).not.toThrow();
  });

  it("uses the linked module when there is one", () => {
    const linked = { ...fallbackPaceNative, canScheduleExactAlarms: () => true };
    expect(resolvePaceNative(linked)).toBe(linked);
    expect(resolvePaceNative(null)).toBe(fallbackPaceNative);
  });
});
