import { clockTime } from "#app/format/time.ts";
import { activityFormOf, type ActivityTarget } from "@pace/client";

import { readDraft } from "./activity-draft.ts";

const MOSCOW = "Europe/Moscow";
const BERLIN = "Europe/Berlin";

/** An edit target for a block with these real boundaries. */
const block = (startAt: string, endAt: null | string): ActivityTarget => ({
  activityId: "a1",
  category: "rest",
  endAt,
  kind: "edit",
  label: "Night",
  startAt,
});

/** The sheet's fields as it opens on `target`, with `typed` changed. */
const opened = (
  target: ActivityTarget,
  zone: string,
  typed: { from?: string; to?: string } = {},
) => ({
  ...activityFormOf(target, (atIso) => clockTime(atIso, zone)),
  ...typed,
});

const NO_FAULTS = { from: null, label: null, to: null };

describe("readDraft on a block's real boundaries", () => {
  // Unchanged fields give back the very instants the sheet opened on, whatever the block's length.
  it.each([
    ["a 13-hour night (20:00 → 09:00)", "2026-10-04T17:00:00.000Z", "2026-10-05T06:00:00.000Z"],
    [
      "a 30-hour block (Fri 20:00 → Sun 07:00)",
      "2026-10-02T17:00:00.000Z",
      "2026-10-04T04:00:00.000Z",
    ],
    ["a 40-hour block", "2026-10-02T17:00:00.000Z", "2026-10-04T09:00:00.000Z"],
    ["a block with seconds", "2026-10-04T17:00:37.512Z", "2026-10-05T06:00:08.004Z"],
  ])("gives back %s unchanged", (_name, startAt, endAt) => {
    const target = block(startAt, endAt);
    expect(readDraft(opened(target, MOSCOW), target, MOSCOW)).toEqual({
      faults: NO_FAULTS,
      range: { endAt, startAt },
    });
  });

  // Berlin goes back from 03:00 to 02:00 on 2026-10-25: 02:30 happens twice.
  it.each([
    ["first", "2026-10-25T00:30:00.000Z"],
    ["second", "2026-10-25T01:30:00.000Z"],
  ])("gives back an end at the %s 02:30 of a summer-time change, unchanged", (_name, endAt) => {
    const target = block("2026-10-24T19:00:00.000Z", endAt);
    expect(readDraft(opened(target, BERLIN), target, BERLIN).range).toEqual({
      endAt,
      startAt: "2026-10-24T19:00:00.000Z",
    });
  });

  it("reads a retyped end on the day the block ends, not the day it starts", () => {
    const target = block("2026-10-02T17:00:00.000Z", "2026-10-04T04:00:00.000Z");
    expect(readDraft(opened(target, MOSCOW, { to: "08:00" }), target, MOSCOW).range).toEqual({
      endAt: "2026-10-04T05:00:00.000Z",
      startAt: "2026-10-02T17:00:00.000Z",
    });
  });

  it("reads a retyped end across a summer-time change by the wall clock", () => {
    const target = block("2026-10-24T18:00:00.000Z", "2026-10-25T08:00:00.000Z");
    expect(readDraft(opened(target, BERLIN, { to: "09:30" }), target, BERLIN).range?.endAt).toBe(
      "2026-10-25T08:30:00.000Z",
    );
  });

  it("moves a retyped end of a night back before midnight when that is nearer", () => {
    const target = block("2026-10-04T17:00:00.000Z", "2026-10-05T06:00:00.000Z");
    expect(readDraft(opened(target, MOSCOW, { to: "23:00" }), target, MOSCOW).range?.endAt).toBe(
      "2026-10-04T20:00:00.000Z",
    );
  });

  it("keeps the end it did not touch when only the start moved", () => {
    const target = block("2026-10-02T17:00:00.000Z", "2026-10-04T04:00:00.000Z");
    expect(readDraft(opened(target, MOSCOW, { from: "21:00" }), target, MOSCOW).range).toEqual({
      endAt: "2026-10-04T04:00:00.000Z",
      startAt: "2026-10-02T18:00:00.000Z",
    });
  });

  it("still refuses an end typed before the start", () => {
    const target = block("2026-10-06T06:00:00.000Z", "2026-10-06T07:00:00.000Z");
    const read = readDraft(opened(target, MOSCOW, { to: "08:30" }), target, MOSCOW);
    expect(read).toEqual({ faults: { ...NO_FAULTS, to: "day.badRange" }, range: null });
  });

  it("gives back a running block's start unchanged", () => {
    const target = block("2026-10-06T06:00:42.000Z", null);
    expect(readDraft(opened(target, MOSCOW), target, MOSCOW)).toEqual({
      faults: NO_FAULTS,
      range: { endAt: null, startAt: "2026-10-06T06:00:42.000Z" },
    });
  });
});

describe("readDraft's round trip", () => {
  // The guard for review I1's class: whatever the block, a sheet saved as it opened moves nothing.
  const zones = [MOSCOW, BERLIN, "America/New_York", "Asia/Kolkata", "Australia/Lord_Howe"];
  const lengths = [1, 719, 721, 1380, 1500, 1800, 2879].map((minutes) => minutes * 60_000 + 7031);
  const starts = Array.from(
    { length: 160 },
    // Every 45 h 42 min (a new hour of the day each time) across 2026's summer-time changes.
    (_, step) => Date.parse("2026-03-26T00:00:00.000Z") + step * 164_520_000,
  );

  it("gives back every block's own instants when nothing was retyped", () => {
    const moved = zones
      .flatMap((zone) =>
        starts.flatMap((startMs) =>
          lengths.map((length) => ({
            target: block(
              new Date(startMs).toISOString(),
              new Date(startMs + length).toISOString(),
            ),
            zone,
          })),
        ),
      )
      .map(({ target, zone }) => ({
        range: readDraft(opened(target, zone), target, zone).range,
        target,
      }))
      .filter(
        ({ range, target }) => range?.startAt !== target.startAt || range.endAt !== target.endAt,
      );
    expect(moved).toEqual([]);
  });
});
