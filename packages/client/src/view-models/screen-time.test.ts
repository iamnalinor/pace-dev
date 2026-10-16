import { describe, expect, it } from "vitest";

import type { UsageRow } from "@pace/core";

import { appsDuring, screenTime } from "./screen-time.ts";

const row = (
  app: string,
  deviceId: string,
  span: { startAt: string; endAt: string },
): UsageRow => ({
  app,
  deviceId,
  deviceName: deviceId,
  ...span,
});

describe("appsDuring", () => {
  it("clips and merges duplicate intervals, then sums the same app across devices", () => {
    const usage = [
      row("Browser", "laptop", {
        startAt: "2026-10-16T08:00:00.000Z",
        endAt: "2026-10-16T09:00:00.000Z",
      }),
      row("Browser", "laptop", {
        startAt: "2026-10-16T08:30:00.000Z",
        endAt: "2026-10-16T09:00:00.000Z",
      }),
      row("Browser", "phone", {
        startAt: "2026-10-16T08:45:00.000Z",
        endAt: "2026-10-16T09:15:00.000Z",
      }),
      row("Chat", "phone", {
        startAt: "2026-10-16T09:00:00.000Z",
        endAt: "2026-10-16T09:30:00.000Z",
      }),
      row("Old", "phone", {
        startAt: "2026-10-16T07:00:00.000Z",
        endAt: "2026-10-16T08:00:00.000Z",
      }),
    ];
    expect(
      appsDuring(usage, {
        startAt: "2026-10-16T08:30:00.000Z",
        endAt: "2026-10-16T09:00:00.000Z",
      }),
    ).toEqual([
      {
        app: "Browser",
        deviceIds: ["laptop", "phone"],
        deviceNames: ["laptop", "phone"],
        firstAt: "2026-10-16T08:30:00.000Z",
        lastAt: "2026-10-16T09:00:00.000Z",
        minutes: 45,
      },
    ]);
  });

  it("returns no apps for an empty or zero-length span", () => {
    expect(
      appsDuring([], { startAt: "2026-10-16T08:00:00.000Z", endAt: "2026-10-16T09:00:00.000Z" }),
    ).toEqual([]);
    expect(
      appsDuring(
        [
          row("Chat", "phone", {
            startAt: "2026-10-16T08:00:00.000Z",
            endAt: "2026-10-16T09:00:00.000Z",
          }),
        ],
        {
          startAt: "2026-10-16T08:30:00.000Z",
          endAt: "2026-10-16T08:30:00.000Z",
        },
      ),
    ).toEqual([]);
  });
});

describe("screenTime", () => {
  it("splits a midnight-spanning session at the account's day boundary", () => {
    const usage = [
      row("Reader", "phone", {
        startAt: "2026-10-15T20:30:00.000Z",
        endAt: "2026-10-15T21:30:00.000Z",
      }),
    ];
    const result = screenTime(usage, "2026-10-16T12:00:00.000Z", "Europe/Moscow");
    expect(result.from).toBe("2026-10-15T21:00:00.000Z");
    expect(result.to).toBe("2026-10-16T21:00:00.000Z");
    expect(result.apps[0]?.minutes).toBe(30);
    expect(result.devices[0]?.minutes).toBe(30);
  });

  it("deduplicates device time while preserving simultaneous use on two devices", () => {
    const usage = [
      row("Browser", "laptop", {
        startAt: "2026-10-16T09:00:00.000Z",
        endAt: "2026-10-16T10:00:00.000Z",
      }),
      row("Browser", "laptop", {
        startAt: "2026-10-16T09:30:00.000Z",
        endAt: "2026-10-16T10:00:00.000Z",
      }),
      row("Browser", "phone", {
        startAt: "2026-10-16T09:00:00.000Z",
        endAt: "2026-10-16T09:30:00.000Z",
      }),
    ];
    const result = screenTime(usage, "2026-10-16T12:00:00.000Z", "Europe/Moscow");
    expect(result.devices.map((device) => device.minutes)).toEqual([60, 30]);
    expect(result.apps[0]?.minutes).toBe(90);
    expect(result.totalMinutes).toBe(90);
  });
});
