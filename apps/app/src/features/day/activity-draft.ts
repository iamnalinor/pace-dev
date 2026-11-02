import type { ActivityForm, ActivityRange, ActivityTarget } from "@pace/client";

import { clockTime, fromWallClock, wallClock } from "#app/format/time.ts";
import { addDaysIn, type MessageKey, type TimeState } from "@pace/core";

/** What the Day sheet checks before a block is saved, each fault under its own field. */
type Draft = ActivityForm;
type SheetTarget = ActivityTarget;

/** Which field reads wrong, if any: its sentence goes under it. */
export type Faults = {
  readonly label: MessageKey | null;
  readonly from: MessageKey | null;
  readonly to: MessageKey | null;
};

/** An end before the start reads as past midnight only for a block this long at most. */
const MAX_OVERNIGHT_MS = 12 * 3_600_000;

/**
A new block's end on its day, or after midnight when it is earlier than the start and the night
is short; `null` for an end equal to the start or a reversed pair (10:00 → 09:30), which
would otherwise silently make a day-long block.
*/
const newEndOf = (sameDay: string, startAt: string, zone: string): null | string => {
  if (sameDay > startAt) {
    return sameDay;
  }
  const nextDay = addDaysIn(sameDay, 1, zone);
  const length = Date.parse(nextDay) - Date.parse(startAt);
  return sameDay < startAt && length <= MAX_OVERNIGHT_MS ? nextDay : null;
};

/** The instant the field opened on while it still shows it: a field nobody touched moves nothing. */
const keptAt = (typed: string, atIso: null | string, zone: string): null | string =>
  atIso !== null && typed === clockTime(atIso, zone) ? atIso : null;

/** `keptAt` while the day chosen for the field is the one it opened on. */
const keptOn = (
  { atIso, day }: { readonly atIso: null | string; readonly day: string },
  typed: string,
  zone: string,
): null | string =>
  atIso !== null && wallClock(atIso, zone).date === day ? keptAt(typed, atIso, zone) : null;

/**
A retyped end of a block that has one: among the instants with that wall clock on the day before,
of or after where the block ended, the nearest to that end that is after the (typed) start and
one of (QA round 18 M3, one rule for every end):
- on the start's own day: an end moves later that day without limit (round-3 review I-a);
- making a block of at most `MAX_OVERNIGHT_MS`, measured from the start, as `newEndOf` does for a
  new block: a short night (22:00–23:00 → 01:00, 22:00–07:00 → 09:00);
- on the old end's day when the block as it was (its stored start, not the typed one) was already
  longer than that: a night or a timer left running is adjusted on the day it ended (Fri 20:00 –
  Sun 07:00 → Sun 08:00; QA round 17 review I1: reading it on the start's day cut a 30-hour block
  by a day without a word), by at most `MAX_OVERNIGHT_MS` either way: an adjustment, not a jump
  (fix round 5 V5: → 23:00 made it 51 hours without a word).
Anything else is a reversed pair, refused in the same words wherever it comes from: an end typed
before the start's clock never becomes a silent day-long block (round-4 review R1: 22:00–02:00 →
21:00 saved 23 hours; QA round 18 M3: a week-old 08:00–21:30 → 07:00 did too, and yesterday's
08:00–21:00 → 07:00 early the next morning was called "still ahead"). The start itself stands
for that refusal. With no start to meet, the nearest: the start's own fault is said.
*/
const movedEndOf = (
  typed: string,
  {
    endAt,
    startAt,
    wasStartAt,
  }: { readonly endAt: string; readonly startAt: null | string; readonly wasStartAt: string },
  zone: string,
): null | string => {
  const was = Date.parse(endAt);
  const nearest = [-1, 0, 1]
    .map((days) => wallClock(addDaysIn(endAt, days, zone), zone).date)
    .map((date) => ({ atIso: fromWallClock({ date, time: typed, tz: zone }), date }))
    .filter((read): read is { atIso: string; date: string } => read.atIso !== null)
    .toSorted((a, b) => Math.abs(Date.parse(a.atIso) - was) - Math.abs(Date.parse(b.atIso) - was));
  if (startAt === null) {
    return nearest[0]?.atIso ?? null;
  }
  if (nearest.length === 0) {
    return null;
  }
  const start = Date.parse(startAt);
  const startDate = wallClock(startAt, zone).date;
  const endDate = wallClock(endAt, zone).date;
  const wasLong = was - Date.parse(wasStartAt) > MAX_OVERNIGHT_MS;
  const fits = nearest.find(
    ({ atIso, date }) =>
      Date.parse(atIso) > start &&
      (date === startDate ||
        Date.parse(atIso) - start <= MAX_OVERNIGHT_MS ||
        (wasLong && date === endDate && Math.abs(Date.parse(atIso) - was) <= MAX_OVERNIGHT_MS)),
  );
  return fits?.atIso ?? startAt;
};

/**
The typed end as an instant before it meets the start: on the day the person chose, when they
chose one (the clock rules below are only for a time typed without a day); else the one the sheet
opened on when untouched, near the old end (and after the typed start) when retyped on a block
that has one, else on the block's day. `undefined` when the text is not a time.
*/
const endFrom = (
  typed: string,
  {
    day,
    startAt,
    target,
  }: { readonly day: null | string; readonly startAt: null | string; readonly target: SheetTarget },
  zone: string,
): string | undefined => {
  if (day !== null) {
    return (
      keptOn({ atIso: target.endAt, day }, typed, zone) ??
      fromWallClock({ date: day, time: typed, tz: zone }) ??
      undefined
    );
  }
  const kept = keptAt(typed, target.endAt, zone);
  if (kept !== null) {
    return kept;
  }
  const read =
    target.kind === "edit" && target.endAt !== null
      ? movedEndOf(typed, { endAt: target.endAt, startAt, wasStartAt: target.startAt }, zone)
      : fromWallClock({ date: wallClock(target.startAt, zone).date, time: typed, tz: zone });
  return read ?? undefined;
};

/**
The end once it meets the start: kept when after it, `null` for a reversed pair. Only a new
block's retyped end may still read as past midnight (see `newEndOf`).
*/
const endAfter = (
  endAt: string,
  startAt: string,
  { isNewEnd, zone }: { readonly isNewEnd: boolean; readonly zone: string },
): null | string => {
  if (isNewEnd) {
    return newEndOf(endAt, startAt, zone);
  }
  return Date.parse(endAt) > Date.parse(startAt) ? endAt : null;
};

/**
What is wrong with the end, if anything: missing on a logged block, not a time (`undefined`),
reversed (`null` once there is a start to meet).
*/
const toFault = (
  draft: Draft,
  target: SheetTarget,
  times: { readonly startAt: null | string; readonly endAt: null | string | undefined },
): MessageKey | null => {
  if (draft.to === "") {
    return target.kind === "log" ? "day.badTime" : null;
  }
  if (times.endAt === undefined) {
    return "day.badTime";
  }
  return times.startAt !== null && times.endAt === null ? "day.badRange" : null;
};

type Times = {
  /** `null` when the text is not a time. */
  readonly startAt: null | string;
  /** `undefined` when the text is not a time; `null` when none was typed or it is reversed. */
  readonly endAt: null | string | undefined;
};

/**
The sheet's typed times as instants. A field left as it opened gives back the very instant it
showed (its seconds, a repeated summer-time hour, a day or more of length); a retyped start is
read on the day chosen for it, else the block's own day, a retyped end as `endFrom` says.
*/
const typedTimes = (draft: Draft, target: SheetTarget, zone: string): Times => {
  const date = draft.fromDay ?? wallClock(target.startAt, zone).date;
  const startAt =
    keptOn({ atIso: target.startAt, day: date }, draft.from, zone) ??
    fromWallClock({ date, time: draft.from, tz: zone });
  const endAt =
    draft.to === "" ? null : endFrom(draft.to, { day: draft.toDay, startAt, target }, zone);
  if (endAt === null || endAt === undefined || startAt === null) {
    return { endAt, startAt };
  }
  const isNewEnd =
    target.kind === "log" && draft.toDay === null && keptAt(draft.to, target.endAt, zone) === null;
  return { endAt: endAfter(endAt, startAt, { isNewEnd, zone }), startAt };
};

const DAY_MS = 86_400_000;

/** Every calendar date from `first` to `last`, both `yyyy-MM-dd` and both included. */
const datesThrough = (first: string, last: string): readonly string[] => {
  const firstMs = Date.parse(`${first}T00:00:00.000Z`);
  const count = Math.round((Date.parse(`${last}T00:00:00.000Z`) - firstMs) / DAY_MS) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, step) =>
    new Date(firstMs + step * DAY_MS).toISOString().slice(0, 10),
  );
};

/**
The days the sheet offers each time to be put on: the start any day the block touched, the end
any day from the start's to the day after it ended (a running block's end has none). A Fri 20:00 –
Sun 07:00 block left running is cut back to Friday by choosing Friday, which the clock rules alone
never reach (round 6).
*/
export const dayChoicesOf = (
  target: SheetTarget,
  zone: string,
): { readonly from: readonly string[]; readonly to: readonly string[] } => {
  const startDate = wallClock(target.startAt, zone).date;
  if (target.endAt === null) {
    return { from: [startDate], to: [] };
  }
  const endDate = wallClock(target.endAt, zone).date;
  const dayAfter = new Date(Date.parse(`${endDate}T00:00:00.000Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { from: datesThrough(startDate, endDate), to: datesThrough(startDate, dayAfter) };
};

/** A block whose start and end fall on different days (an end at midnight is still the day before). */
export const isAcrossDays = (target: SheetTarget, zone: string): boolean =>
  target.endAt !== null &&
  wallClock(new Date(Date.parse(target.endAt) - 1).toISOString(), zone).date !==
    wallClock(target.startAt, zone).date;

export const readDraft = (
  draft: Draft,
  target: SheetTarget,
  zone: string,
): { readonly range: ActivityRange | null; readonly faults: Faults } => {
  const { endAt, startAt } = typedTimes(draft, target, zone);
  const faults: Faults = {
    from: startAt === null ? "day.badTime" : null,
    label: draft.label.trim() === "" ? "day.whatMissing" : null,
    to: toFault(draft, target, { endAt, startAt }),
  };
  return {
    faults,
    range: startAt === null || faults.to !== null ? null : { endAt: endAt ?? null, startAt },
  };
};

type Read = { readonly range: ActivityRange | null; readonly faults: Faults };

/** A block is what already happened: a start or an end after now is said under its field. */
export const notAhead = (read: Read, now: string): Read => {
  const { range } = read;
  if (range === null) {
    return read;
  }
  const isStartAhead = Date.parse(range.startAt) > Date.parse(now);
  const isEndAhead = range.endAt !== null && Date.parse(range.endAt) > Date.parse(now);
  return isStartAhead || isEndAhead
    ? {
        faults: {
          ...read.faults,
          ...(isStartAhead && { from: "day.ahead" }),
          ...(isEndAhead && { to: "day.ahead" }),
        },
        range: null,
      }
    : read;
};

/**
A moved end may not run into the next live activity: the timeline would clip it back without
a word. `nextStart` is that activity's start (none for a new block or the last one).
*/
export const notIntoNext = (read: Read, nextStart: null | string): Read => {
  const endAt = read.range?.endAt ?? null;
  return nextStart === null || endAt === null || Date.parse(endAt) <= Date.parse(nextStart)
    ? read
    : { faults: { ...read.faults, to: "day.overlapsNext" }, range: null };
};

/** The start of the live main activity after this block, if any. */
export const nextStartOf = (time: TimeState, target: SheetTarget): null | string => {
  if (target.kind !== "edit") {
    return null;
  }
  const later = Object.values(time.activities)
    .filter(
      (activity) =>
        activity.id !== target.activityId &&
        !activity.isAlongside &&
        !activity.isLogged &&
        Date.parse(activity.startAt) > Date.parse(target.startAt),
    )
    .map((activity) => activity.startAt)
    .toSorted((a, b) => Date.parse(a) - Date.parse(b));
  return later[0] ?? null;
};

export const hasFault = (faults: Faults): boolean =>
  faults.label !== null || faults.from !== null || faults.to !== null;
