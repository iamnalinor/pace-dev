import type { ActivityForm, ActivityRange, ActivityTarget } from "@pace/client";

import { fromWallClock, wallClock } from "#app/format/time.ts";
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
The end on the block's day, or after midnight when it is earlier than the start and the night
is short; `null` for an end equal to the start or a reversed pair (10:00 → 09:30), which
would otherwise silently make a day-long block.
*/
const endOf = (sameDay: string, startAt: string, zone: string): null | string => {
  if (sameDay > startAt) {
    return sameDay;
  }
  const nextDay = addDaysIn(sameDay, 1, zone);
  const length = Date.parse(nextDay) - Date.parse(startAt);
  return sameDay < startAt && length <= MAX_OVERNIGHT_MS ? nextDay : null;
};

/**
The typed clock times on the block's own day (see `endOf` for one past midnight). A logged
block needs its end; a running one has none yet.
*/
/** What is wrong with the end, if anything: missing on a logged block, not a time, reversed. */
const toFault = (
  draft: Draft,
  target: SheetTarget,
  times: {
    readonly startAt: null | string;
    readonly sameDay: null | string;
    readonly zone: string;
  },
): MessageKey | null => {
  if (draft.to === "") {
    return target.kind === "log" ? "day.badTime" : null;
  }
  if (times.sameDay === null) {
    return "day.badTime";
  }
  return times.startAt !== null && endOf(times.sameDay, times.startAt, times.zone) === null
    ? "day.badRange"
    : null;
};

export const readDraft = (
  draft: Draft,
  target: SheetTarget,
  zone: string,
): { readonly range: ActivityRange | null; readonly faults: Faults } => {
  const { date } = wallClock(target.startAt, zone);
  const startAt = fromWallClock({ date, time: draft.from, tz: zone });
  const sameDay = draft.to === "" ? null : fromWallClock({ date, time: draft.to, tz: zone });
  const faults: Faults = {
    from: startAt === null ? "day.badTime" : null,
    label: draft.label.trim() === "" ? "day.whatMissing" : null,
    to: toFault(draft, target, { sameDay, startAt, zone }),
  };
  if (startAt === null || faults.to !== null) {
    return { faults, range: null };
  }
  return {
    faults,
    range: { endAt: sameDay === null ? null : endOf(sameDay, startAt, zone), startAt },
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
