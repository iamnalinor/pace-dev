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

/**
A retyped end of a block that has one: the instant with that wall clock nearest to where the
block ended, on the day before, of or after it, among those after the start (QA round 17 review
I1; round-3 review I-a: taking the nearest before checking the start sent 08:00–09:00 retyped to
21:30 to the evening before). The sheet types clock times only, and a block's end may be a day or
two after its start: a night, a timer left running. Reading it on the start's day cut a 30-hour
block by a day without a word. A later day is taken only within `MAX_OVERNIGHT_MS` of the old end,
so a time typed before the start of a short block stays a reversed pair, not a day-long block.
With none after the start (or no start to meet), the nearest: the range check says what is wrong.
*/
const movedEndOf = (
  typed: string,
  { endAt, startAt }: { readonly endAt: string; readonly startAt: null | string },
  zone: string,
): null | string => {
  const was = Date.parse(endAt);
  const { date: endDate } = wallClock(endAt, zone);
  const nearest = [-1, 0, 1]
    .map((days) => wallClock(addDaysIn(endAt, days, zone), zone).date)
    .map((date) => ({ atIso: fromWallClock({ date, time: typed, tz: zone }), date }))
    .filter((read): read is { atIso: string; date: string } => read.atIso !== null)
    .toSorted((a, b) => Math.abs(Date.parse(a.atIso) - was) - Math.abs(Date.parse(b.atIso) - was));
  const fits = nearest.find(
    ({ atIso, date }) =>
      (startAt === null || Date.parse(atIso) > Date.parse(startAt)) &&
      (date <= endDate || Date.parse(atIso) - was <= MAX_OVERNIGHT_MS),
  );
  return (fits ?? nearest[0])?.atIso ?? null;
};

/**
The typed end as an instant before it meets the start: the one the sheet opened on when
untouched, near the old end (and after the typed start) when retyped on a block that has one,
else on the block's day. `undefined` when the text is not a time.
*/
const endFrom = (
  typed: string,
  { startAt, target }: { readonly startAt: null | string; readonly target: SheetTarget },
  zone: string,
): string | undefined => {
  const kept = keptAt(typed, target.endAt, zone);
  if (kept !== null) {
    return kept;
  }
  const read =
    target.kind === "edit" && target.endAt !== null
      ? movedEndOf(typed, { endAt: target.endAt, startAt }, zone)
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
read on the block's own day, a retyped end as `endFrom` says.
*/
const typedTimes = (draft: Draft, target: SheetTarget, zone: string): Times => {
  const { date } = wallClock(target.startAt, zone);
  const startAt =
    keptAt(draft.from, target.startAt, zone) ?? fromWallClock({ date, time: draft.from, tz: zone });
  const endAt = draft.to === "" ? null : endFrom(draft.to, { startAt, target }, zone);
  if (endAt === null || endAt === undefined || startAt === null) {
    return { endAt, startAt };
  }
  const isNewEnd = target.kind === "log" && keptAt(draft.to, target.endAt, zone) === null;
  return { endAt: endAfter(endAt, startAt, { isNewEnd, zone }), startAt };
};

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
