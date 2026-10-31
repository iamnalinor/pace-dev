import { toPhoneEvents } from "./phone-data.ts";

const event = (eventType: number, packageName: string, timestamp: number) => ({
  className: null,
  eventType,
  packageName,
  timestamp,
});

describe("toPhoneEvents", () => {
  it("keeps screen and app foreground events, drops the launcher and the system bars", () => {
    const at = Date.parse("2026-10-06T07:00:00.000Z");
    expect(
      toPhoneEvents([
        event(2, "org.telegram.messenger", at + 60_000),
        event(15, "android", at),
        event(1, "org.telegram.messenger", at + 1000),
        event(1, "com.google.android.apps.nexuslauncher", at + 2000),
        event(1, "com.android.systemui", at + 3000),
        event(1, "dev.nalinor.pace", at + 4000),
        event(7, "org.telegram.messenger", at + 5000),
        event(16, "android", at + 120_000),
      ]),
    ).toEqual([
      { at: "2026-10-06T07:00:00.000Z", kind: "screen-on" },
      { app: "org.telegram.messenger", at: "2026-10-06T07:00:01.000Z", kind: "app-start" },
      { at: "2026-10-06T07:00:04.000Z", kind: "unlock" },
      { app: "org.telegram.messenger", at: "2026-10-06T07:01:00.000Z", kind: "app-stop" },
      { at: "2026-10-06T07:02:00.000Z", kind: "screen-off" },
    ]);
  });

  it("reads a shutdown as the screen going off, so a use never spans a dead phone", () => {
    const at = Date.parse("2026-10-06T07:00:00.000Z");
    expect(toPhoneEvents([event(26, "android", at)])).toEqual([
      { at: "2026-10-06T07:00:00.000Z", kind: "screen-off" },
    ]);
  });

  it("reads the lock screen coming and going, and Pace coming to the front as an unlock", () => {
    const at = Date.parse("2026-10-06T07:00:00.000Z");
    expect(
      toPhoneEvents([
        event(15, "android", at),
        event(17, "android", at + 500),
        event(18, "android", at + 1000),
        event(1, "dev.nalinor.pace", at + 2000),
        event(2, "dev.nalinor.pace", at + 3000),
        event(16, "android", at + 4000),
      ]),
    ).toEqual([
      { at: "2026-10-06T07:00:00.000Z", kind: "screen-on" },
      { at: "2026-10-06T07:00:00.500Z", kind: "lock" },
      { at: "2026-10-06T07:00:01.000Z", kind: "unlock" },
      { at: "2026-10-06T07:00:02.000Z", kind: "unlock" },
      { at: "2026-10-06T07:00:04.000Z", kind: "screen-off" },
    ]);
  });
});
