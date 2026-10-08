import { toPhoneEvents } from "./phone-data.ts";

const event = (eventType: number, packageName: string, timestamp: number) => ({
  className: null,
  eventType,
  packageName,
  timestamp,
});

describe("toPhoneEvents", () => {
  it("keeps screen and app foreground events, drops the launcher, the system bars and Pace", () => {
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
      { app: "org.telegram.messenger", at: "2026-10-06T07:01:00.000Z", kind: "app-stop" },
      { at: "2026-10-06T07:02:00.000Z", kind: "screen-off" },
    ]);
  });
});
