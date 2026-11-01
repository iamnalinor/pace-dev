import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type Event, EventIdSchema } from "../events/event-schema.ts";
import {
  isAutoSleepId,
  sleepDiscardId,
  sleepNightOf,
  sleepReopenId,
  sleepStartId,
  sleepStopId,
} from "../ids.ts";
import { addMinutesIso, wallClockInstant } from "../time.ts";
import { isRestClass, REST_CLASS } from "./categories.ts";
import {
  at,
  byPerson,
  type Known,
  MOSCOW,
  NEW_YORK,
  NOISY_NIGHT,
  sleepsIn,
  SPARSE_EVENING,
  step,
  steps,
  use,
  usesFromPhone,
} from "./sleep-auto.fake.ts";
import { decideSleep, type DeviceUse, type SleepDecision } from "./sleep-auto.ts";

const NIGHT = "2026-10-07";
/** The automatic sleep started at `hhmm` in the default night, and its own events' ids. */
const startId = (hhmm: string): string => sleepStartId(NIGHT, at(hhmm));
const stopId = (start: string, hhmm: string): string => sleepStopId(startId(start), at(hhmm));

const open = (hhmm: string): SleepDecision => ({ at: at(hhmm), kind: "open", night: NIGHT });
const stop = (start: string, hhmm: string): SleepDecision => ({
  activityId: startId(start),
  at: at(hhmm),
  kind: "stop",
});
const reopen = (start: string, stoppedAt: string): SleepDecision => ({
  activityId: startId(start),
  kind: "reopen",
  stopEventId: stopId(start, stoppedAt),
});
const discard = (start: string): SleepDecision => ({
  activityId: startId(start),
  kind: "discard",
  startEventId: startId(start),
});
const sleep = (from: string, to: null | string) => ({
  endAt: to === null ? null : at(to),
  startAt: at(from),
});

const decisionsAt = (log: readonly Event[], uses: readonly DeviceUse[], hhmms: readonly string[]) =>
  steps(
    log,
    uses,
    hhmms.map((hhmm) => at(hhmm)),
  ).map((done) => done.decisions);
const lastLog = (log: readonly Event[], uses: readonly DeviceUse[], hhmms: readonly string[]) =>
  steps(
    log,
    uses,
    hhmms.map((hhmm) => at(hhmm)),
  ).at(-1)?.log ?? [];

/** A use from 20:30 to `end`, told at 23:00. */
const evening = (end: string) => step([], { knownUntil: at("23:00"), uses: [use("20:30", end)] });
/** Up all night until `end`, told at 08:00. */
const allNight = (end: string) =>
  step([], { knownUntil: at("08:00"), uses: [use("20:00", end)] }).decisions;
/** Asleep after 23:40, a wake from `from` to `to`. */
const wakeAt = (from: string, to: string) => [use("23:10", "23:40"), use(from, to)];

/** The person's own sleep, started at `hhmm` from the app. */
const PERSON_SLEEP = "person-sleep";
const personSleep = (hhmm: string): Event =>
  byPerson(1, at(hhmm), {
    payload: { activityId: PERSON_SLEEP, category: "sleep", label: "Sleep" },
    type: "activity.started",
  });

describe("sleep ids", () => {
  it("names the noon-to-noon night an instant falls in, in the person's zone", () => {
    expect(sleepNightOf(at("23:40"), MOSCOW)).toBe(NIGHT);
    expect(sleepNightOf(at("11:59"), MOSCOW)).toBe(NIGHT);
    expect(sleepNightOf(at("12:00", { night: "2026-10-08" }), MOSCOW)).toBe("2026-10-08");
    expect(sleepNightOf(at("00:30"), MOSCOW)).toBe(NIGHT);
    // 03:30 in New York on the night the clocks go back is still the night of October 31.
    const dstNight = { night: "2026-10-31", zone: NEW_YORK };
    expect(sleepNightOf(at("03:30", dstNight), NEW_YORK)).toBe("2026-10-31");
    expect(sleepNightOf(at("11:59", dstNight), NEW_YORK)).toBe("2026-10-31");
    expect(sleepNightOf(at("12:00", { night: "2026-11-01", zone: NEW_YORK }), NEW_YORK)).toBe(
      "2026-11-01",
    );
  });

  it("builds every id from the night and an instant, and the log accepts each of them", () => {
    const start = sleepStartId(NIGHT, at("23:40"));
    expect(start).toBe("auto:sleep-2026-10-07:start-20261007T2040");
    const stopped = sleepStopId(start, at("07:10"));
    expect(stopped).toBe(`auto:${start}:stop-20261008T0410`);
    expect(sleepReopenId(stopped)).toBe(`auto:${stopped}:reopen`);
    expect(sleepDiscardId(start)).toBe(`auto:${start}:discard`);
    const personStop = sleepStopId("01ARZ3NDEKTSV4RRFFQ69G5001", at("02:10"));
    for (const id of [start, stopped, sleepReopenId(stopped), sleepDiscardId(start), personStop]) {
      expect(EventIdSchema.safeParse(id).success).toBe(true);
      expect(isAutoSleepId(id)).toBe(true);
    }
  });

  it("tells automatic sleep ids from everything else in the log", () => {
    expect(isAutoSleepId("01ARZ3NDEKTSV4RRFFQ69G5001")).toBe(false);
    expect(isAutoSleepId("auto:01ARZ3NDEKTSV4RRFFQ69G5001:missed")).toBe(false);
    expect(isAutoSleepId("hw:hw.algebra:2026-W41")).toBe(false);
  });
});

describe("the rest class", () => {
  it("is rest and sleep", () => {
    expect(REST_CLASS).toEqual(["rest", "sleep"]);
    expect(isRestClass("rest")).toBe(true);
    expect(isRestClass("sleep")).toBe(true);
    expect(isRestClass("task")).toBe(false);
    expect(isRestClass("work")).toBe(false);
  });
});

describe("automatic sleep", () => {
  const NIGHT_1 = [use("23:10", "23:40"), use("07:10", "07:25")];

  it("1. opens at the last use and stops at the first one in the morning", () => {
    const done = step([], { knownUntil: at("07:30"), uses: NIGHT_1 });
    expect(done.decisions).toEqual([open("23:40"), stop("23:40", "07:10")]);
    expect(sleepsIn(done.log)).toEqual([sleep("23:40", "07:10")]);
    // The same night told in two uploads ends the same way.
    expect(decisionsAt([], NIGHT_1, ["00:30", "07:30"])).toEqual([
      [open("23:40")],
      [stop("23:40", "07:10")],
    ]);
    expect(sleepsIn(lastLog([], NIGHT_1, ["00:30", "07:30"]))).toEqual([sleep("23:40", "07:10")]);
  });

  it("writes a start labelled Sleep, a stop, and revocations, all from the system", () => {
    const { events } = step([], { knownUntil: at("07:30"), uses: NIGHT_1 });
    expect(events).toEqual([
      {
        id: startId("23:40"),
        occurredAt: at("23:40"),
        payload: { activityId: startId("23:40"), category: "sleep", label: "Sleep" },
        precision: "approx",
        source: "system",
        type: "activity.started",
      },
      {
        id: stopId("23:40", "07:10"),
        occurredAt: at("07:10"),
        payload: { activityId: startId("23:40") },
        precision: "approx",
        source: "system",
        type: "activity.stopped",
      },
    ]);
  });

  it("2. stops at a short wake, then reopens it once the rest after it is long enough", () => {
    const uses = [use("23:10", "23:40"), use("03:00", "03:06"), use("07:10", "07:25")];
    const done = steps(
      [],
      uses,
      ["00:30", "03:20", "04:40", "07:30"].map((hhmm) => at(hhmm)),
    );
    expect(done.map((each) => each.decisions)).toEqual([
      [open("23:40")],
      [stop("23:40", "03:00")],
      [reopen("23:40", "03:00")],
      [stop("23:40", "07:10")],
    ]);
    expect(done[2]?.events).toEqual([
      {
        id: sleepReopenId(stopId("23:40", "03:00")),
        occurredAt: addMinutesIso(at("04:40"), 5),
        payload: { targetId: stopId("23:40", "03:00") },
        precision: "exact",
        source: "system",
        type: "event.revoked",
      },
    ]);
    expect(sleepsIn(done.at(-1)?.log ?? [])).toEqual([sleep("23:40", "07:10")]);
    // Told at once in the morning, the wake-up is inside the night from the start.
    expect(step([], { knownUntil: at("07:30"), uses }).decisions).toEqual([
      open("23:40"),
      stop("23:40", "07:10"),
    ]);
  });

  it("2. does not discard a short sleep while the wake that stopped it may still be a wake-up", () => {
    const uses = [use("23:50", "00:30"), use("01:30", "01:35")];
    expect(decisionsAt([], uses, ["01:20", "01:50", "03:10"])).toEqual([
      [open("00:30")],
      [stop("00:30", "01:30")],
      [reopen("00:30", "01:30")],
    ]);
  });

  it("8. discards a sleep ended by a short spell with too little rest after it, then reopens the night", () => {
    // 01:30–01:35 is short, but the phone is back at 02:30: not a wake-up, the sleep ended there.
    const uses = [use("23:50", "00:30"), use("01:30", "01:35"), use("02:30", "02:40")];
    expect(decisionsAt([], uses, ["01:20", "02:45", "04:20"])).toEqual([
      [open("00:30")],
      [stop("00:30", "01:30"), discard("00:30"), open("01:35"), stop("01:35", "02:30")],
      [reopen("01:35", "02:30")],
    ]);
  });

  it("3. stops for good at a wake longer than 30 minutes and opens nothing more that night", () => {
    const uses = [use("23:10", "23:40"), use("03:00", "03:40"), use("07:10", "07:25")];
    expect(decisionsAt([], uses, ["00:30", "05:00", "07:30"])).toEqual([
      [open("23:40")],
      [stop("23:40", "03:00")],
      [],
    ]);
    expect(sleepsIn(lastLog([], uses, ["00:30", "05:00", "07:30"]))).toEqual([
      sleep("23:40", "03:00"),
    ]);
  });

  it("4. keeps the start of a sleep the person started, stops it on use, reopens it", () => {
    const uses = [use("22:50", "23:00"), use("02:10", "02:14")];
    const done = steps(
      [personSleep("23:00")],
      uses,
      ["01:00", "02:30", "03:50"].map((hhmm) => at(hhmm)),
    );
    const personStop = sleepStopId(PERSON_SLEEP, at("02:10"));
    expect(done.map((each) => each.decisions)).toEqual([
      [],
      [{ activityId: PERSON_SLEEP, at: at("02:10"), kind: "stop" }],
      [{ activityId: PERSON_SLEEP, kind: "reopen", stopEventId: personStop }],
    ]);
    expect(sleepsIn(done.at(-1)?.log ?? [])).toEqual([sleep("23:00", null)]);
  });

  it("4. never discards a short sleep the person started", () => {
    const uses = [use("02:10", "02:50"), use("07:10", "07:20")];
    const done = steps(
      [personSleep("01:30")],
      uses,
      ["03:00", "07:30"].map((hhmm) => at(hhmm)),
    );
    expect(done.map((each) => each.decisions)).toEqual([
      [{ activityId: PERSON_SLEEP, at: at("02:10"), kind: "stop" }],
      [],
    ]);
    expect(sleepsIn(done.at(-1)?.log ?? [])).toEqual([sleep("01:30", "02:10")]);
  });

  it("4. does not take going to the home screen after pressing Sleep for a wake", () => {
    // Pressed in Pace at 23:00, then the launcher came to the front while locking the phone.
    const uses = [use("22:50", "23:02"), use("23:01", "23:02")];
    expect(step([personSleep("23:00")], { knownUntil: at("01:00"), uses }).decisions).toEqual([]);
  });

  it("5. opens nothing while a rest runs, and opens over a task focus left running", () => {
    const uses = [use("22:00", "22:20")];
    const known: Known = { knownUntil: at("23:30"), uses };
    const rest = byPerson(1, at("22:30"), {
      payload: { activityId: "rest", category: "rest", label: "Rest" },
      type: "activity.started",
    });
    expect(step([rest], known).decisions).toEqual([]);
    const focus = byPerson(1, at("21:00"), {
      payload: { activityId: "focus", category: "task", label: "Essay" },
      type: "activity.started",
    });
    const done = step([focus], known);
    expect(done.decisions).toEqual([open("22:20")]);
    expect(sleepsIn(done.log)).toEqual([sleep("22:20", null)]);
  });

  it("6. never assumes quiet past what the phone has told", () => {
    const uses = [use("23:50", "00:30"), use("01:30", "01:40")];
    expect(step([], { knownUntil: at("01:00"), uses }).decisions).toEqual([]);
    expect(step([], { knownUntil: at("01:15"), uses }).decisions).toEqual([open("00:30")]);
    expect(step([], { knownUntil: at("01:20"), uses }).decisions).toEqual([open("00:30")]);
    expect(step([], { knownUntil: null, uses }).decisions).toEqual([]);
  });

  it("7. decides nothing more on its own result, and names the same events every time", () => {
    const known: Known = { knownUntil: at("07:30"), uses: NIGHT_1 };
    const first = step([], known);
    expect(step(first.log, known).decisions).toEqual([]);
    expect(step([], known).events).toEqual(first.events);
  });

  it("8. discards a short evening rest and opens the real night under a new id", () => {
    const uses = [
      use("20:40", "21:10"),
      use("22:05", "22:30"),
      use("23:00", "23:30"),
      use("07:00", "07:20"),
    ];
    const done = steps(
      [],
      uses,
      ["22:00", "22:20", "07:30"].map((hhmm) => at(hhmm)),
    );
    expect(done.map((each) => each.decisions)).toEqual([
      [open("21:10")],
      [stop("21:10", "22:05"), discard("21:10")],
      [open("23:30"), stop("23:30", "07:00")],
    ]);
    expect(startId("23:30")).not.toBe(startId("21:10"));
    expect(sleepsIn(done[1]?.log ?? [])).toEqual([]);
    expect(sleepsIn(done.at(-1)?.log ?? [])).toEqual([sleep("23:30", "07:00")]);
    // Told at once, the evening rest that would be discarded is never opened.
    expect(step([], { knownUntil: at("07:30"), uses }).decisions).toEqual([
      open("23:30"),
      stop("23:30", "07:00"),
    ]);
  });

  it("9. starts no earlier than 21:00 and no later than 05:00", () => {
    expect(evening("20:59").decisions).toEqual([open("21:00")]);
    expect(evening("21:00").decisions).toEqual([open("21:00")]);
    expect(evening("21:01").decisions).toEqual([open("21:01")]);
    expect(allNight("04:59")).toEqual([open("04:59")]);
    expect(allNight("05:00")).toEqual([]);
  });

  it("9. counts a wake starting at 06:59 as a wake-up and one at 07:00 as the morning", () => {
    expect(decisionsAt([], wakeAt("06:59", "07:05"), ["00:30", "07:20", "08:40"])).toEqual([
      [open("23:40")],
      [stop("23:40", "06:59")],
      [reopen("23:40", "06:59")],
    ]);
    const morning = wakeAt("07:00", "07:06");
    expect(decisionsAt([], morning, ["00:30", "07:20", "08:40"])).toEqual([
      [open("23:40")],
      [stop("23:40", "07:00")],
      [],
    ]);
    expect(sleepsIn(lastLog([], morning, ["00:30", "07:20", "08:40"]))).toEqual([
      sleep("23:40", "07:00"),
    ]);
  });

  it("10. stops and discards a sleep a computer's late upload shows was not one", () => {
    const phone = [use("22:30", "23:00")];
    const opened = step([], { knownUntil: at("23:50"), uses: phone });
    expect(opened.decisions).toEqual([open("23:00")]);
    const late = [...phone, use("23:20", "23:30", "laptop")];
    const corrected = step(opened.log, { knownUntil: at("23:55"), uses: late });
    expect(corrected.decisions).toEqual([stop("23:00", "23:20"), discard("23:00")]);
    expect(sleepsIn(corrected.log)).toEqual([]);
    expect(step(corrected.log, { knownUntil: at("23:55"), uses: late }).decisions).toEqual([]);
  });

  it("11. respects the person undoing an automatic stop, and stops later under its own id", () => {
    const uses = [use("23:10", "23:40"), use("03:00", "03:40"), use("07:10", "07:25")];
    const stopped = lastLog([], uses, ["00:30", "05:00"]);
    const undo = byPerson(9, at("05:10"), {
      payload: { targetId: stopId("23:40", "03:00") },
      type: "event.revoked",
    });
    const undone = [...stopped, undo];
    expect(sleepsIn(undone)).toEqual([sleep("23:40", null)]);
    expect(step(undone, { knownUntil: at("05:30"), uses }).decisions).toEqual([]);
    const morning = step(undone, { knownUntil: at("07:30"), uses });
    expect(morning.decisions).toEqual([stop("23:40", "07:10")]);
    expect(morning.events[0]?.id).toBe(stopId("23:40", "07:10"));
    expect(sleepsIn(morning.log)).toEqual([sleep("23:40", "07:10")]);
  });

  it("is not woken by notifications or an alarm over the lock screen", () => {
    const uses = usesFromPhone(NOISY_NIGHT, at("07:30"));
    expect(step([], { knownUntil: at("07:30"), uses }).decisions).toEqual([
      open("23:40"),
      stop("23:40", "07:10"),
    ]);
  });

  it("opens nothing in a sparse evening, only after its last use", () => {
    const known = (hhmm: string): Known => ({ knownUntil: at(hhmm), uses: SPARSE_EVENING });
    expect(step([], known("22:45")).decisions).toEqual([]);
    const lastEnd = SPARSE_EVENING.at(-1)?.endAt ?? "";
    expect(step([], known("23:50")).decisions).toEqual([
      { at: lastEnd, kind: "open", night: NIGHT },
    ]);
  });

  it("leaves a stop the person made where it is", () => {
    const uses = [use("23:10", "23:40"), use("03:00", "03:06")];
    const opened = lastLog([], uses, ["00:30"]);
    const personStop = byPerson(5, at("03:00"), {
      payload: { activityId: startId("23:40") },
      type: "activity.stopped",
    });
    const log = [...opened, personStop];
    expect(step(log, { knownUntil: at("05:00"), uses }).decisions).toEqual([]);
    expect(sleepsIn(log)).toEqual([sleep("23:40", "03:00")]);
  });

  it("does not stretch one sleep over the next day when the phone stays silent", () => {
    // Asleep at 23:40, the phone silent until 03:00 two nights later: that wake is another night's.
    const nextNight = { night: "2026-10-08" };
    const lastUse = use("23:10", "23:40");
    const wake = {
      deviceId: "phone",
      endAt: at("03:10", nextNight),
      startAt: at("03:00", nextNight),
    };
    const log = lastLog([], [lastUse], ["00:30"]);
    const later = step(log, { knownUntil: at("05:00", nextNight), uses: [lastUse, wake] });
    expect(later.decisions).toEqual([
      { activityId: startId("23:40"), at: wake.startAt, kind: "stop" },
      { at: wake.endAt, kind: "open", night: "2026-10-08" },
    ]);
  });
});

// ── Properties over offsets from a fixed night (class 9), with a DST night in New York ──

const MINUTE = 60;
const DST_NIGHT = "2026-10-31";
const ZONES = [MOSCOW, NEW_YORK] as const;
/** Two nights and the day between: 18:00 on October 31 plus up to 36 hours. */
const SPAN = 36 * MINUTE;

const base = (zone: string): string => wallClockInstant(DST_NIGHT, "18:00", zone);
/** Any use on either device in the span... */
const anyUse = fc.record({
  device: fc.constantFrom("phone", "laptop"),
  length: fc.integer({ max: 50, min: 1 }),
  start: fc.integer({ max: SPAN, min: 0 }),
});
/** ...or a phone wake in one of the two nights (23:00–08:00), so wake-ups and reopens happen. */
const nightStart = fc.oneof(
  fc.integer({ max: 14 * MINUTE, min: 5 * MINUTE }),
  fc.integer({ max: SPAN, min: 29 * MINUTE }),
);
const nightWake = fc.record({
  device: fc.constant("phone"),
  length: fc.integer({ max: 35, min: 1 }),
  start: nightStart,
});
const usesArb = fc.array(fc.oneof(anyUse, nightWake), { maxLength: 25 });
const toUses = (
  zone: string,
  raw: readonly { readonly device: string; readonly start: number; readonly length: number }[],
): readonly DeviceUse[] =>
  raw
    .map(({ device, length, start }) => ({
      deviceId: device,
      endAt: addMinutesIso(base(zone), start + length),
      startAt: addMinutesIso(base(zone), start),
    }))
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt));
const knowledgeArb = fc.array(fc.integer({ max: SPAN, min: 0 }), { maxLength: 6, minLength: 1 });

const instantOf = (decision: SleepDecision): null | string =>
  decision.kind === "open" || decision.kind === "stop" ? decision.at : null;

describe("automatic sleep, properties", () => {
  it("12. is idempotent, never decides past what is known, one sleep a night at most", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ZONES), usesArb, knowledgeArb, (zone, raw, offsets) => {
        const uses = toUses(zone, raw);
        const knownUntils = offsets
          .toSorted((a, b) => a - b)
          .map((m) => addMinutesIso(base(zone), m));
        // eslint-disable-next-line unicorn/no-array-reduce -- each upload is decided on the log the one before left
        const log = knownUntils.reduce<readonly Event[]>((current, knownUntil) => {
          const done = step(current, { knownUntil, uses, zone });
          for (const decision of done.decisions) {
            const instant = instantOf(decision);
            expect(instant === null || instant <= knownUntil).toBe(true);
          }
          // Same input, same ids.
          expect(step(current, { knownUntil, uses, zone }).events).toEqual(done.events);
          return done.log;
        }, []);
        const last = knownUntils.at(-1) ?? null;
        expect(step(log, { knownUntil: last, uses, zone }).decisions).toEqual([]);
        const nights = sleepsIn(log).map((each) => sleepNightOf(each.startAt, zone));
        expect(new Set(nights).size).toBe(nights.length);
      }),
      { numRuns: 300 },
    );
  });

  it("12. never yields a sleep from a day of use no more than 44 minutes apart (class 39)", () => {
    const day = fc.array(
      fc.record({ gap: fc.integer({ max: 44, min: 0 }), length: fc.integer({ max: 20, min: 1 }) }),
      { maxLength: 200, minLength: 1 },
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...ZONES),
        day,
        fc.integer({ max: 44, min: 0 }),
        (zone, spells, tail) => {
          const from = wallClockInstant(DST_NIGHT, "08:00", zone);
          const until = wallClockInstant("2026-11-01", "02:00", zone);
          // eslint-disable-next-line unicorn/no-array-reduce -- each use starts a gap after the one before
          const uses = spells.reduce<readonly DeviceUse[]>((laid, { gap, length }) => {
            const startAt = addMinutesIso(laid.at(-1)?.endAt ?? from, gap);
            return startAt >= until
              ? laid
              : [...laid, { deviceId: "phone", endAt: addMinutesIso(startAt, length), startAt }];
          }, []);
          // Laid until 02:00 at least: the day is one spell of use.
          const filled = [
            ...uses,
            ...Array.from({ length: 30 * 2 }, (_, index) =>
              addMinutesIso(uses.at(-1)?.endAt ?? from, (index + 1) * 40),
            )
              .filter((startAt) => startAt < until)
              .map((startAt) => ({
                deviceId: "laptop",
                endAt: addMinutesIso(startAt, 1),
                startAt,
              })),
          ];
          const lastEnd = filled.at(-1)?.endAt ?? from;
          const knownUntil = addMinutesIso(lastEnd, tail);
          expect(
            decideSleep({ activities: [], knownUntil, now: knownUntil, uses: filled, zone }),
          ).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
