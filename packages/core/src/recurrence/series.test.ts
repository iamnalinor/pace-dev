import { describe, expect, it } from "vitest";

import { nextSeriesSlot, seriesSlotAt } from "./series.ts";

const MONTHLY = { kind: "monthly" as const };
const ZONE = "Europe/Berlin";

describe("recurring task series calendar", () => {
  it("clamps the 31st in short months and returns to the 31st", () => {
    const anchor = "2026-01-31T08:00:00.000Z";
    expect(seriesSlotAt(anchor, MONTHLY, { index: 1, zone: ZONE })).toBe(
      "2026-02-28T08:00:00.000Z",
    );
    expect(seriesSlotAt(anchor, MONTHLY, { index: 2, zone: ZONE })).toBe(
      "2026-03-31T07:00:00.000Z",
    );
  });

  it("keeps local wall time across DST for daily tasks", () => {
    const anchor = "2026-03-28T08:00:00.000Z";
    expect(seriesSlotAt(anchor, { kind: "daily" }, { index: 1, zone: ZONE })).toBe(
      "2026-03-29T07:00:00.000Z",
    );
  });

  it("finds the next weekday and respects the optional last date", () => {
    const anchor = "2026-10-16T07:00:00.000Z";
    expect(
      nextSeriesSlot(
        anchor,
        { kind: "weekdays", until: "2026-10-19" },
        { after: "2026-10-16T08:00:00.000Z", zone: ZONE },
      ),
    ).toEqual({ index: 1, at: "2026-10-19T07:00:00.000Z" });
    expect(
      nextSeriesSlot(
        anchor,
        { kind: "weekdays", until: "2026-10-16" },
        { after: "2026-10-16T08:00:00.000Z", zone: ZONE },
      ),
    ).toBeNull();
  });

  it("uses the requested N-day interval", () => {
    expect(
      nextSeriesSlot(
        "2026-10-01T09:00:00.000Z",
        { kind: "every_n_days", days: 3 },
        { after: "2026-10-07T09:00:00.000Z", zone: "UTC" },
      ),
    ).toEqual({ index: 3, at: "2026-10-10T09:00:00.000Z" });
  });
});
