import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";
import type { DeviceUse } from "./sleep-auto.ts";

import { addMinutesIso, formatInZone, wallClockInstant } from "../time.ts";
import { at, byPerson, MOSCOW, NEW_YORK, step, use } from "./sleep-auto.fake.ts";
import { sleepHorizon } from "./sleep-horizon.ts";

/** The latest of some instants. */
const laterOf = (first: string, ...rest: readonly string[]): string =>
  [first, ...rest].toSorted((a, b) => a.localeCompare(b)).at(-1) ?? first;

const ZONES = [MOSCOW, NEW_YORK] as const;
/** 18:00 on the night before New York's DST change, and 36 hours on. */
const base = (zone: string): string => wallClockInstant("2026-10-31", "18:00", zone);
const SPAN = 36 * 60;

const usesArb = fc.array(
  fc.record({
    device: fc.constantFrom("phone", "phone", "laptop"),
    length: fc.integer({ max: 40, min: 1 }),
    start: fc.integer({ max: SPAN, min: 0 }),
  }),
  { maxLength: 20 },
);
/** The person's own records: work started (and maybe stopped) live, or a rest logged. */
const recordsArb = fc.array(
  fc.record({
    category: fc.constantFrom("work", "study", "rest"),
    length: fc.integer({ max: 180, min: 0 }),
    start: fc.integer({ max: SPAN, min: 0 }),
    stops: fc.boolean(),
  }),
  { maxLength: 3 },
);

type Raw = { readonly device: string; readonly length: number; readonly start: number };
type Record = {
  readonly category: "rest" | "study" | "work";
  readonly length: number;
  readonly start: number;
  readonly stops: boolean;
};

const usesOf = (zone: string, raw: readonly Raw[]): readonly DeviceUse[] =>
  raw.map(({ device, length, start }) => ({
    deviceId: device,
    endAt: addMinutesIso(base(zone), start + length),
    startAt: addMinutesIso(base(zone), start),
  }));

const recordEvents = (zone: string, record: Record, index: number): readonly Event[] => {
  const startAt = addMinutesIso(base(zone), record.start);
  const activityId = `record-${String(index)}`;
  const started = byPerson(100 + 2 * index, startAt, {
    payload: { activityId, category: record.category, label: "Deploy" },
    type: "activity.started",
  });
  const stopped = byPerson(101 + 2 * index, addMinutesIso(startAt, record.length), {
    payload: { activityId },
    type: "activity.stopped",
  });
  return record.stops ? [started, stopped] : [started];
};

const world = fc.record({
  /**
  How far the window's front moved on by the later pass (minutes after `base`): it moves with
  `now`, so a later pass reads the uses that end after it, and only those.
  */
  front: fc.integer({ max: SPAN, min: 0 }),
  known: fc.integer({ max: SPAN, min: 0 }),
  /** How far the pass runs after what the phones told: their uploads lag, by hours in Doze. */
  lag: fc.integer({ max: 240, min: 5 }),
  later: fc.integer({ max: 24 * 60, min: 1 }),
  raw: usesArb,
  records: recordsArb,
  zone: fc.constantFrom(...ZONES),
});

/** One pass at `known` minutes into the span, on the person's records made by then. */
const passAt = ({
  known,
  lag,
  raw,
  records,
  zone,
}: {
  known: number;
  lag: number;
  raw: readonly Raw[];
  records: readonly Record[];
  zone: string;
}) => {
  const knownUntil = addMinutesIso(base(zone), known);
  const now = addMinutesIso(knownUntil, lag);
  const log = records
    .flatMap((record, index) => recordEvents(zone, record, index))
    .filter((event) => event.occurredAt <= now);
  const uses = usesOf(zone, raw);
  return {
    done: step(log, { knownUntil, now, uses, usesFrom: base(zone), zone }),
    knownUntil,
    now,
    uses,
  };
};

/** The later pass's window: from the front moved on (short of what was known), its uses. */
const windowAt = (
  { front, zone }: { front: number; zone: string },
  { knownUntil, uses }: { knownUntil: string; uses: readonly DeviceUse[] },
) => {
  const usesFrom = addMinutesIso(base(zone), front);
  const isShort = usesFrom < knownUntil;
  return {
    isShort,
    usesFrom,
    within: (more: readonly DeviceUse[]) =>
      [...uses, ...more].filter((use) => use.endAt > usesFrom),
  };
};

describe("how far a pass of automatic sleep holds", () => {
  it("13. decides nothing more before its horizon, with the same uses and log, wherever the window's front is", () => {
    fc.assert(
      fc.property(world, ({ front, known, lag, later, raw, records, zone }) => {
        const { done, knownUntil, now, uses } = passAt({ known, lag, raw, records, zone });
        const { quietUntil } = sleepHorizon(done.input);
        const reached = addMinutesIso(knownUntil, later);
        fc.pre(quietUntil === null || reached < quietUntil);
        const window = windowAt({ front, zone }, { knownUntil, uses });
        fc.pre(window.isShort);
        const again = step(done.log, {
          decidedUntil: knownUntil,
          knownUntil: reached,
          now: reached > now ? addMinutesIso(reached, 5) : now,
          uses: window.within([]),
          usesFrom: window.usesFrom,
          zone,
        });
        expect(again.decisions).toEqual([]);
      }),
      { numRuns: 400 },
    );
  }, 60_000);

  it("13. decides nothing more as the window's front moves on, short of what is known", () => {
    fc.assert(
      fc.property(
        world,
        fc.integer({ max: SPAN, min: 1 }),
        ({ known, lag, raw, records, zone }, front) => {
          const { done, knownUntil, now, uses } = passAt({ known, lag, raw, records, zone });
          const usesFrom = addMinutesIso(base(zone), front);
          fc.pre(usesFrom < knownUntil);
          // The store reads only the uses that end after the front (`usageForSleep`).
          const again = step(done.log, {
            decidedUntil: knownUntil,
            knownUntil,
            now,
            uses: uses.filter((use) => use.endAt > usesFrom),
            usesFrom,
            zone,
          });
          expect(again.decisions).toEqual([]);
        },
      ),
      { numRuns: 1000 },
    );
  }, 60_000);

  it("13. decides nothing more by day once settled, whatever is used after it, wherever the window's front is", () => {
    const freshArb = fc.array(
      fc.record({
        device: fc.constantFrom("phone", "laptop"),
        length: fc.integer({ max: 40, min: 1 }),
        offset: fc.integer({ max: 9 * 60, min: 0 }),
      }),
      { maxLength: 10 },
    );
    fc.assert(
      fc.property(world, freshArb, ({ front, known, lag, raw, records, zone }, fresh) => {
        const { done, knownUntil, now, uses } = passAt({ known, lag, raw, records, zone });
        const hour = Number(formatInZone(knownUntil, zone, "H"));
        fc.pre(sleepHorizon(done.input).isSettled && hour >= 12 && hour < 21);
        const day = formatInZone(knownUntil, zone, "yyyy-MM-dd");
        const evening = wallClockInstant(day, "21:00", zone);
        // New use on any device, all after what was known and before the evening.
        const added = fresh
          .map(({ device, length, offset }) => ({
            deviceId: device,
            endAt: addMinutesIso(knownUntil, offset + length),
            startAt: addMinutesIso(knownUntil, offset),
          }))
          .filter((each) => each.endAt < evening);
        const until = laterOf(knownUntil, ...added.map((each) => each.endAt));
        const window = windowAt({ front, zone }, { knownUntil, uses });
        fc.pre(window.isShort);
        const again = step(done.log, {
          decidedUntil: knownUntil,
          knownUntil: until,
          now: until > now ? addMinutesIso(until, 5) : now,
          uses: window.within(added),
          usesFrom: window.usesFrom,
          zone,
        });
        expect(again.decisions).toEqual([]);
      }),
      { numRuns: 400 },
    );
  }, 60_000);

  it("names the next instant a decision waits on: the 45 minutes of quiet that open the night", () => {
    const done = step([], { knownUntil: at("23:50"), uses: [use("23:10", "23:40")] });
    expect(done.decisions).toEqual([]);
    expect(sleepHorizon(done.input)).toEqual({ isSettled: true, quietUntil: at("00:25") });
    // Opened: the sleep runs on, so any use from now on may end it.
    const opened = step(done.log, { knownUntil: at("00:30"), uses: [use("23:10", "23:40")] });
    expect(sleepHorizon(opened.input).isSettled).toBe(false);
  });

  it("waits on a rest of the person's that starts after what the phones told", () => {
    // Told until 02:00; the person rested 02:10–02:12 (recorded live, the pass runs at 02:20).
    const rest = byPerson(1, at("02:10"), {
      payload: { activityId: "rest", category: "rest", label: "Rest" },
      type: "activity.started",
    });
    const rested = byPerson(2, at("02:12"), {
      payload: { activityId: "rest" },
      type: "activity.stopped",
    });
    const known = { knownUntil: at("02:00"), now: at("02:20"), uses: [use("21:30", "22:00")] };
    const done = step([rest, rested], known);
    // Once known past its start, the rest moves where the night may start.
    expect(sleepHorizon(done.input).quietUntil).toBe(at("02:10"));
  });
});
