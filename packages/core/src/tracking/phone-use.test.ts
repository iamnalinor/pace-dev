import { describe, expect, it } from "vitest";

import { type PhoneEvent, phoneUses } from "./phone-use.ts";

const at = (hhmm: string): string => `2026-10-06T${hhmm}:00.000Z`;

describe("phoneUses", () => {
  it("is the unlocked spells and apps in front, by start, as times only", () => {
    const events: readonly PhoneEvent[] = [
      { at: at("07:10"), kind: "screen-on" },
      { at: at("07:10"), kind: "unlock" },
      { app: "org.telegram.messenger", at: at("07:11"), kind: "app-start" },
      { app: "org.telegram.messenger", at: at("07:20"), kind: "app-stop" },
      { at: at("07:21"), kind: "screen-off" },
    ];
    // Which app was in front never leaves the phone with its uses.
    expect(phoneUses(events, at("10:00"))).toEqual([
      { endAt: at("07:21"), startAt: at("07:10") },
      { endAt: at("07:20"), startAt: at("07:11") },
    ]);
  });

  it("leaves out an alarm shown over the lock screen", () => {
    const events: readonly PhoneEvent[] = [
      { at: at("01:21"), kind: "lock" },
      { at: at("06:30"), kind: "screen-on" },
      { app: "com.google.android.deskclock", at: at("06:30"), kind: "app-start" },
      { app: "com.google.android.deskclock", at: at("06:35"), kind: "app-stop" },
      { at: at("06:35"), kind: "screen-off" },
    ];
    expect(phoneUses(events, at("10:00"))).toEqual([]);
  });
});
