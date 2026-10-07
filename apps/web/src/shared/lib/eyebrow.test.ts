import { describe, expect, it } from "vitest";

import { formatEyebrow } from "./eyebrow.ts";

describe("formatEyebrow", () => {
  const date = new Date("2026-10-06T12:00:00Z");

  it("renders weekday · month day in English", () => {
    expect(formatEyebrow(date, "en", "UTC")).toBe("Tue · Oct 6");
  });

  it("renders weekday · day month in Russian", () => {
    expect(formatEyebrow(date, "ru", "UTC")).toBe("вт · 6 окт.");
  });

  it("follows the zone's calendar day", () => {
    expect(formatEyebrow(new Date("2026-10-06T23:30:00Z"), "en", "Europe/Moscow")).toBe(
      "Wed · Oct 7",
    );
  });
});
