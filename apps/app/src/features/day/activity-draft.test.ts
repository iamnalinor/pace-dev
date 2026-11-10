import type { Activity, TimeState } from "@pace/core";

import { clockTime, fromWallClock, wallClock } from "#app/format/time.ts";
import { activityFormOf, type ActivityTarget } from "@pace/client";

import { dayChoicesOf, overlapOf, readDraft } from "./activity-draft.ts";

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

  it.each([
    // 22:00 Mon – 02:00 Tue in Moscow, To retyped 21:00: not Mon 22:00 – Tue 21:00 (23 h).
    {
      endAt: "2026-10-05T23:00:00.000Z",
      name: "22:00–02:00 retyped to 21:00",
      startAt: "2026-10-05T19:00:00.000Z",
      to: "21:00",
    },
    // 23:30–00:30, To retyped 23:00: not a 23.5-hour block.
    {
      endAt: "2026-10-05T21:30:00.000Z",
      name: "23:30–00:30 retyped to 23:00",
      startAt: "2026-10-05T20:30:00.000Z",
      to: "23:00",
    },
  ])(
    "refuses an end typed before the start of a block crossing midnight: $name",
    ({ endAt, startAt, to }) => {
      const target = block(startAt, endAt);
      expect(readDraft(opened(target, MOSCOW, { to }), target, MOSCOW)).toEqual({
        faults: { ...NO_FAULTS, to: "day.badRange" },
        range: null,
      });
    },
  );

  it.each([
    // QA round 18 M3: a 21-hour block from a 9-hour night is refused, not adjusted on its end's day.
    {
      endAt: "2026-10-06T04:00:00.000Z",
      name: "22:00–07:00 → 19:00",
      startAt: "2026-10-05T19:00:00.000Z",
      to: "19:00",
    },
    // Yesterday's 13-hour 08:00–21:00 → 07:00 would end the next morning, 23 hours on.
    {
      endAt: "2026-10-05T18:00:00.000Z",
      name: "08:00–21:00 → 07:00",
      startAt: "2026-10-05T05:00:00.000Z",
      to: "07:00",
    },
    // Fix round 5 V5: a 35-hour Fri 20:00 – Sun 07:00 → 23:00 would be 51 hours: a jump of 16
    // hours on its end's day, not an adjustment of it.
    {
      endAt: "2026-10-04T04:00:00.000Z",
      name: "Fri 20:00 – Sun 07:00 → 23:00",
      startAt: "2026-10-02T17:00:00.000Z",
      to: "23:00",
    },
  ])(
    "refuses an end typed before the start that makes a day-long block: $name",
    ({ endAt, startAt, to }) => {
      const target = block(startAt, endAt);
      expect(readDraft(opened(target, MOSCOW, { to }), target, MOSCOW)).toEqual({
        faults: { ...NO_FAULTS, to: "day.badRange" },
        range: null,
      });
    },
  );

  it("moves a night's end later the next morning while the block stays within 12 hours", () => {
    // 22:00–07:00 in Moscow, To retyped 09:00: an 11-hour night.
    const target = block("2026-10-05T19:00:00.000Z", "2026-10-06T04:00:00.000Z");
    expect(readDraft(opened(target, MOSCOW, { to: "09:00" }), target, MOSCOW).range?.endAt).toBe(
      "2026-10-06T06:00:00.000Z",
    );
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

describe("readDraft on an end typed before the start of a block crossing midnight", () => {
  // The guard for round-4 review R1's class (and QA round 18 M3's rule): the end of a block of at
  // most 12 hours that crosses midnight, retyped to a time earlier than the start's clock, is a
  // reversed pair or makes a block of at most 12 hours, never a day-long block. Nights of
  // summer-time changes included.
  const zones = [MOSCOW, BERLIN, "America/New_York", "Asia/Kolkata", "Australia/Lord_Howe"];
  const days = ["2026-03-28", "2026-04-04", "2026-07-15", "2026-10-24", "2026-10-31"];
  const lengths = [60, 240, 540, 700].map((minutes) => minutes * 60_000);
  const startTimes = ["15:00", "20:30", "22:00", "23:30"];
  const MAX_BLOCK_MS = 12 * 3_600_000;

  const blocks = zones.flatMap((zone) =>
    days.flatMap((date) =>
      startTimes.flatMap((time) => {
        const startAt = fromWallClock({ date, time, tz: zone }) ?? "";
        return lengths
          .map((length) => new Date(Date.parse(startAt) + length).toISOString())
          .filter((endAt) => wallClock(endAt, zone).date > date)
          .map((endAt) => ({ target: block(startAt, endAt), zone }));
      }),
    ),
  );

  it("reads every such time as a reversed pair or a block of at most 12 hours", () => {
    expect(blocks.length).toBeGreaterThan(100);
    const wrong = blocks.flatMap(({ target, zone }) =>
      TYPED.filter((to) => to < clockTime(target.startAt, zone))
        .map((to) => ({
          read: readDraft(opened(target, zone, { to }), target, zone),
          target,
          to,
          zone,
        }))
        .filter(({ read }) => {
          const endAt = read.range?.endAt;
          return endAt === undefined || endAt === null
            ? read.faults.to !== "day.badRange"
            : Date.parse(endAt) - Date.parse(target.startAt) > MAX_BLOCK_MS;
        }),
    );
    expect(wrong).toEqual([]);
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

describe("readDraft with a day chosen for a time (round 6: a runaway block cut back)", () => {
  // Fri 20:00 → Sun 07:00 in Moscow: a timer left running all weekend.
  const runaway = block("2026-10-02T17:00:00.000Z", "2026-10-04T04:00:00.000Z");

  it("reads the end on the chosen day, however far from the old end", () => {
    const draft = { ...opened(runaway, MOSCOW, { to: "23:00" }), toDay: "2026-10-02" };
    expect(readDraft(draft, runaway, MOSCOW)).toEqual({
      faults: NO_FAULTS,
      range: { endAt: "2026-10-02T20:00:00.000Z", startAt: "2026-10-02T17:00:00.000Z" },
    });
  });

  it("moves an untouched end's clock to the chosen day", () => {
    const draft = { ...opened(runaway, MOSCOW), toDay: "2026-10-03" };
    expect(readDraft(draft, runaway, MOSCOW).range?.endAt).toBe("2026-10-03T04:00:00.000Z");
  });

  it("keeps the very instant when the chosen day is the one the end was on", () => {
    const target = block("2026-10-02T17:00:00.000Z", "2026-10-04T04:00:08.004Z");
    const draft = { ...opened(target, MOSCOW), toDay: "2026-10-04" };
    expect(readDraft(draft, target, MOSCOW).range?.endAt).toBe("2026-10-04T04:00:08.004Z");
  });

  it.each([
    ["on the start's day, before its clock", "2026-10-02", "19:00"],
    ["on a day before the start", "2026-10-01", "23:00"],
  ])("refuses an end %s in the usual words", (_name, toDay, to) => {
    const draft = { ...opened(runaway, MOSCOW, { to }), toDay };
    expect(readDraft(draft, runaway, MOSCOW)).toEqual({
      faults: { ...NO_FAULTS, to: "day.badRange" },
      range: null,
    });
  });

  it("reads the start on its chosen day", () => {
    const draft = { ...opened(runaway, MOSCOW, { from: "22:00" }), fromDay: "2026-10-03" };
    expect(readDraft(draft, runaway, MOSCOW).range).toEqual({
      endAt: "2026-10-04T04:00:00.000Z",
      startAt: "2026-10-03T19:00:00.000Z",
    });
  });

  it("never reads a chosen end as past midnight on a new block", () => {
    const target: ActivityTarget = {
      endAt: "2026-10-05T20:00:00.000Z",
      kind: "log",
      startAt: "2026-10-05T19:00:00.000Z",
    };
    const draft = {
      ...opened(target, MOSCOW, { to: "01:00" }),
      toDay: "2026-10-05",
    };
    expect(readDraft(draft, target, MOSCOW).faults.to).toBe("day.badRange");
  });
});

/** A "now" well after every block here: no end day is ahead of it. */
const LATER = "2026-12-01T00:00:00.000Z";

describe("the days a time may be put on", () => {
  it("offers no end day that is still ahead (QA21 L3: tomorrow was always refused)", () => {
    const target = block("2026-10-31T04:31:00.000Z", "2026-11-02T16:32:00.000Z");
    // Monday evening in Moscow: Tuesday has not begun.
    expect(dayChoicesOf(target, MOSCOW, "2026-11-02T17:00:00.000Z").to).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    // After Moscow's midnight Tuesday is today: an end may be put on it.
    expect(dayChoicesOf(target, MOSCOW, "2026-11-02T21:30:00.000Z").to.at(-1)).toBe("2026-11-03");
  });

  it("offers the end every day from the start's to the day after the old end", () => {
    const target = block("2026-10-02T17:00:00.000Z", "2026-10-04T04:00:00.000Z");
    expect(dayChoicesOf(target, MOSCOW, LATER)).toEqual({
      from: ["2026-10-02", "2026-10-03", "2026-10-04"],
      to: ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],
    });
  });

  it("offers a one-day block's end its day and the next, its start no other", () => {
    const target = block("2026-10-06T06:00:00.000Z", "2026-10-06T07:00:00.000Z");
    expect(dayChoicesOf(target, MOSCOW, LATER)).toEqual({
      from: ["2026-10-06"],
      to: ["2026-10-06", "2026-10-07"],
    });
  });

  it("offers no end day for a block still running", () => {
    expect(dayChoicesOf(block("2026-10-06T06:00:00.000Z", null), MOSCOW, LATER)).toEqual({
      from: ["2026-10-06"],
      to: [],
    });
  });
});

/** An activity of the store, logged unless said otherwise. */
const activity = (
  id: string,
  [startAt, endAt]: readonly [string, null | string],
  options: { isLogged?: boolean; isAlongside?: boolean; label?: string } = {},
): Activity => ({
  buttonId: null,
  category: "other",
  endAt,
  expectMinutes: null,
  id,
  isAlongside: options.isAlongside ?? false,
  isLogged: options.isLogged ?? true,
  label: options.label ?? id,
  originEventId: `e-${id}`,
  startAt,
  stillAt: null,
  taskId: null,
});

const at = (clock: string): string => `2026-10-06T${clock}:00.000Z`;
const NOW_AT = at("15:00");
const timeOf = (...activities: readonly Activity[]): TimeState => ({
  activities: Object.fromEntries(activities.map((item) => [item.id, item])),
});
const logTarget: ActivityTarget = { endAt: at("10:30"), kind: "log", startAt: at("10:00") };
const editOf = (item: Activity): ActivityTarget => ({
  activityId: item.id,
  category: item.category,
  endAt: item.endAt,
  kind: "edit",
  label: item.label,
  startAt: item.startAt,
});
const range = (from: string, to: null | string) => ({
  endAt: to === null ? null : at(to),
  startAt: at(from),
});
const CLEAR = { next: false, previous: false, yieldsFrom: null };

describe("overlapOf: a block may not overlap another, in either direction (review I2, I3, R26-03)", () => {
  const logged = activity("logged", [at("10:00"), at("10:30")]);

  it("refuses a new block with the same start as a logged one (it would vanish from the line)", () => {
    expect(
      overlapOf(timeOf(logged), { now: NOW_AT, range: range("10:00", "11:00"), target: logTarget }),
    ).toEqual({
      ...CLEAR,
      next: true,
    });
  });

  it("refuses a new block that starts inside a logged one before it", () => {
    expect(
      overlapOf(timeOf(logged), { now: NOW_AT, range: range("10:15", "11:00"), target: logTarget }),
    ).toEqual({
      ...CLEAR,
      previous: true,
    });
  });

  it("takes a block that only touches its neighbours", () => {
    expect(
      overlapOf(timeOf(logged), { now: NOW_AT, range: range("10:30", "11:00"), target: logTarget }),
    ).toEqual(CLEAR);
    expect(
      overlapOf(timeOf(logged), { now: NOW_AT, range: range("09:30", "10:00"), target: logTarget }),
    ).toEqual(CLEAR);
  });

  it("refuses a block's start moved back into the live block before it", () => {
    const first = activity("first", [at("10:00"), at("11:00")], { isLogged: false });
    const second = activity("second", [at("11:00"), at("12:00")], { isLogged: false });
    expect(
      overlapOf(timeOf(first, second), {
        now: NOW_AT,
        range: range("10:40", "12:00"),
        target: editOf(second),
      }),
    ).toEqual({ ...CLEAR, previous: true });
  });

  it("lets a logged block take time out of the live one it lands in, and names it (spec: inserting a past activity cuts or splits its neighbours)", () => {
    const work = activity("work", [at("09:00"), null], { isLogged: false, label: "Work" });
    expect(
      overlapOf(timeOf(work), { now: NOW_AT, range: range("12:00", "13:00"), target: logTarget }),
    ).toEqual({
      ...CLEAR,
      yieldsFrom: "Work",
    });
  });

  it("still refuses a logged block over the start of a live one after it (R25-01)", () => {
    const lecture = activity("lecture", [at("13:00"), null], { isLogged: false });
    expect(
      overlapOf(timeOf(lecture), {
        now: NOW_AT,
        range: range("12:00", "13:30"),
        target: logTarget,
      }),
    ).toEqual({
      ...CLEAR,
      next: true,
    });
  });

  it("refuses nothing for a block run alongside, renamed across a switch of the main line (I3)", () => {
    const music = activity("music", [at("10:00"), at("12:00")], { isAlongside: true });
    const study = activity("study", [at("10:00"), at("11:00")], { isLogged: false });
    const rest = activity("rest", [at("11:00"), at("12:00")], { isLogged: false });
    expect(
      overlapOf(timeOf(music, study, rest), {
        now: NOW_AT,
        range: range("10:00", "12:00"),
        target: editOf(music),
      }),
    ).toEqual(CLEAR);
  });

  it("refuses nothing a rename keeps as it was: lunch logged inside a live block", () => {
    const work = activity("work", [at("09:00"), at("14:00")], { isLogged: false });
    const lunch = activity("lunch", [at("12:00"), at("13:00")]);
    expect(
      overlapOf(timeOf(work, lunch), {
        now: NOW_AT,
        range: range("09:00", "14:00"),
        target: editOf(work),
      }),
    ).toEqual(CLEAR);
    // Moving its end on past another block is new, and refused.
    const tea = activity("tea", [at("14:00"), at("14:30")]);
    expect(
      overlapOf(timeOf(work, lunch, tea), {
        now: NOW_AT,
        range: range("09:00", "14:20"),
        target: editOf(work),
      }),
    ).toEqual({ ...CLEAR, next: true });
  });

  it("refuses a running block's start moved back over a logged block, under its start", () => {
    const lunch = activity("lunch", [at("12:00"), at("13:00")]);
    const work = activity("work", [at("13:00"), null], { isLogged: false });
    expect(
      overlapOf(timeOf(lunch, work), {
        now: NOW_AT,
        range: range("11:00", null),
        target: editOf(work),
      }),
    ).toEqual({
      ...CLEAR,
      next: true,
    });
  });
});
