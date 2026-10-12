import { describe, expect, it } from "vitest";

import { whereSat } from "./where-sat.ts";

/** A session of `app` on `deviceName` between two `hh:mm` of the day. */
const row = (deviceName: string, app: string, [startAt, endAt]: readonly [string, string]) => ({
  app,
  deviceId: deviceName.toLowerCase(),
  deviceName,
  endAt: `2026-10-06T${endAt}:00.000Z`,
  startAt: `2026-10-06T${startAt}:00.000Z`,
});

describe("where the time of a block went", () => {
  it("sums each device's apps inside the block, largest first, and leaves out a stray minute", () => {
    const usage = [
      row("Laptop", "code", ["09:30", "10:40"]),
      row("Laptop", "firefox", ["10:40", "10:55"]),
      row("Phone", "org.telegram.messenger", ["10:10", "10:20"]),
      row("Laptop", "code", ["10:55", "11:30"]),
      row("Phone", "com.whatsapp", ["10:59:30", "11:00:10"]),
    ];
    const block = { endAt: "2026-10-06T11:00:00.000Z", startAt: "2026-10-06T10:00:00.000Z" };
    expect(whereSat(block, usage)).toEqual([
      { app: "code", deviceName: "Laptop", minutes: 45 },
      { app: "firefox", deviceName: "Laptop", minutes: 15 },
      { app: "org.telegram.messenger", deviceName: "Phone", minutes: 10 },
    ]);
  });
});
