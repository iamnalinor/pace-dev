import { clockTime, fromWallClock, wallClock } from "#app/format/time.ts";
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

  it("moves a short block's end more than 12 hours later on its own day (round-3 review I-a)", () => {
    // 08:00–09:00 in Moscow, To retyped 21:30: yesterday's 21:30 is nearer the old end, but before
    // the start.
    const target = block("2026-10-06T05:00:00.000Z", "2026-10-06T06:00:00.000Z");
    expect(readDraft(opened(target, MOSCOW, { to: "21:30" }), target, MOSCOW)).toEqual({
      faults: NO_FAULTS,
      range: { endAt: "2026-10-06T18:30:00.000Z", startAt: "2026-10-06T05:00:00.000Z" },
    });
  });

  it("moves an evening block's end past midnight when typed earlier than its start", () => {
    // 22:00–23:00 in Moscow, To retyped 01:00: the night after, not a reversed pair.
    const target = block("2026-10-06T19:00:00.000Z", "2026-10-06T20:00:00.000Z");
    expect(readDraft(opened(target, MOSCOW, { to: "01:00" }), target, MOSCOW).range?.endAt).toBe(
      "2026-10-06T22:00:00.000Z",
    );
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

/** Every 45 minutes of a day (each hour at another minute), as the sheet's field spells it. */
const TYPED = Array.from({ length: 32 }, (_, step) => {
  const minutes = step * 45;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

describe("readDraft on an end moved later the same day", () => {
  // The guard for round-3 review I-a's class: a short block's end retyped to any later time of the
  // day it sits in stays on that day, however far on; days of a summer-time change included.
  const zones = [MOSCOW, BERLIN, "America/New_York", "Asia/Kolkata", "Australia/Lord_Howe"];
  // Berlin's spring change, Lord Howe's half-hour one, a plain summer day, New York's autumn one.
  const days = ["2026-03-29", "2026-04-05", "2026-07-15", "2026-11-01"];
  const lengths = [1, 300, 719].map((minutes) => minutes * 60_000);
  const startTimes = ["00:00", "03:10", "08:00", "20:30"];

  /** Every short block of the sweep that starts and ends on one day, with that day. */
  const blocks = zones.flatMap((zone) =>
    days.flatMap((date) =>
      startTimes.flatMap((time) => {
        const startAt = fromWallClock({ date, time, tz: zone }) ?? "";
        return lengths
          .map((length) => new Date(Date.parse(startAt) + length).toISOString())
          .filter((endAt) => wallClock(endAt, zone).date === date)
          .map((endAt) => ({ date, target: block(startAt, endAt), zone }));
      }),
    ),
  );

  /** The times typed into To that do not come back as that time of the block's own day. */
  const misread = ({ date, target, zone }: (typeof blocks)[number]) =>
    TYPED.map((to) => ({ to, wanted: fromWallClock({ date, time: to, tz: zone }) ?? "" }))
      // Only a time that exists that day (not in a skipped hour) and is later than the end.
      .filter(
        ({ to, wanted }) => wallClock(wanted, zone).time === to && wanted > (target.endAt ?? ""),
      )
      .map(({ to, wanted }) => ({
        read: readDraft(opened(target, zone, { to }), target, zone),
        target,
        to,
        wanted,
        zone,
      }))
      .filter(({ read, wanted }) => read.range?.endAt !== wanted);

  it("comes back on the block's own day for every later time typed", () => {
    expect(blocks.length).toBeGreaterThan(150);
    expect(blocks.flatMap((item) => misread(item))).toEqual([]);
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
