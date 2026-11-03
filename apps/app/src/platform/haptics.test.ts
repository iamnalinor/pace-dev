import * as Haptics from "expo-haptics";

import { haptic } from "./haptics.ts";
import { haptic as webHaptic } from "./haptics.web.ts";

jest.mock("expo-haptics", () => ({
  AndroidHaptics: {
    Clock_Tick: "clock-tick",
    Confirm: "confirm",
    Long_Press: "long-press",
    Reject: "reject",
  },
  performAndroidHapticsAsync: jest.fn(async () => undefined),
}));

const perform = jest.mocked(Haptics.performAndroidHapticsAsync);

describe("haptic (spec §3.10)", () => {
  beforeEach(() => {
    perform.mockClear();
  });

  it.each([
    ["confirm", "confirm"],
    ["tick", "clock-tick"],
    ["longPress", "long-press"],
    ["reject", "reject"],
  ] as const)("plays %s as Android's %s, once", (kind, android) => {
    haptic(kind);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledWith(android);
  });

  it("never lets a phone without a vibrator break the press", async () => {
    perform.mockRejectedValueOnce(new Error("no vibrator"));
    expect(() => {
      haptic("confirm");
    }).not.toThrow();
    // The rejection is settled, not left unhandled.
    await Promise.resolve();
  });

  it("is silent in the browser", () => {
    webHaptic("confirm");
    expect(perform).not.toHaveBeenCalled();
  });
});
