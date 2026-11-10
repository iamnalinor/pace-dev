import { clockTime, fromWallClock, wallClock } from "#app/format/time.ts";
import {
  type ActivityForm,
  type ActivityRange,
  type ActivityTarget,
  readTime,
  typeTime,
} from "@pace/client";
import { type Activity, addDaysIn, type MessageKey, type TimeState } from "@pace/core";

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

/** «7» or «14» alone as 07:00 or 14:00; any other text as it is. */
const sharp = (text: string): string => {
  const read = readTime(text);
  return read.isComplete && !typeTime(text).isComplete ? read.text : text;
};

/**
The sheet's typed times as instants. A field left as it opened gives back the very instant it
showed (its seconds, a repeated summer-time hour, a day or more of length); a retyped start is
read on the day chosen for it, else the block's own day, a retyped end as `endFrom` says.
*/
const typedTimes = (typedDraft: Draft, target: SheetTarget, zone: string): Times => {
  // An hour typed alone is that hour sharp, as when the field is left (R27-04).
  const draft = { ...typedDraft, from: sharp(typedDraft.from), to: sharp(typedDraft.to) };
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
any day from the start's to the day after it ended, but never one that has not begun (a block is
what already happened: tomorrow's chip was always refused, QA21 L3); a running block's end has none. A Fri 20:00 –
Sun 07:00 block left running is cut back to Friday by choosing Friday, which the clock rules alone
never reach (round 6).
*/
export const dayChoicesOf = (
  target: SheetTarget,
  zone: string,
  now: string,
): { readonly from: readonly string[]; readonly to: readonly string[] } => {
  const startDate = wallClock(target.startAt, zone).date;
  if (target.endAt === null) {
    return { from: [startDate], to: [] };
  }
  const endDate = wallClock(target.endAt, zone).date;
  const dayAfter = new Date(Date.parse(`${endDate}T00:00:00.000Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
  const today = wallClock(now, zone).date;
  return {
    from: datesThrough(startDate, endDate),
    to: datesThrough(startDate, dayAfter).filter((date) => date <= today),
  };
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

/** What saving the draft would do to the other blocks of the main line. */
export type Overlap = {
  /** It would cover the start of a later block (or one with the same start): refused. */
  readonly next: boolean;
  /** It would cut into a block before it that does not give time up: refused. */
  readonly previous: boolean;
  /** The live block it lands in, which gives its time up to a logged one: said, not refused. */
  readonly yieldsFrom: null | string;
};

const NO_OVERLAP: Overlap = { next: false, previous: false, yieldsFrom: null };

type Clash = {
  readonly id: string;
  readonly label: string;
  readonly isLater: boolean;
  readonly isYielding: boolean;
};

/** The other main blocks a range of the draft shares time with (touching is not sharing). */
const clashesOf = (
  others: readonly Activity[],
  range: ActivityRange,
  { isLogged, now }: { readonly isLogged: boolean; readonly now: string },
): readonly Clash[] => {
  const start = Date.parse(range.startAt);
  const end = Date.parse(range.endAt ?? now);
  return others
    .map((other) => ({
      end: Date.parse(other.endAt ?? now),
      other,
      start: Date.parse(other.startAt),
    }))
    .filter((span) => span.start < end && span.end > start)
    .map(({ other, start: otherStart }) => ({
      id: other.id,
      // A later start (or the same one) is the next block: the timeline would cut one of them.
      isLater: otherStart >= start,
      // A logged block wins over the live time it covers: the live one before it gives it up.
      isYielding: isLogged && !other.isLogged && otherStart < start,
      label: other.label,
    }));
};

/**
What the draft's range does to the other blocks of the main line. One rule for every way a block is
written (the edit form, a gap's Log, Log past; QA round 25 R25-01, review I2, R26-03), in both
directions: a block may not share time with another one, a later or earlier one, a live or a
logged one, the same start included, because the timeline would cut one of them back without a
word (a later start wins among blocks of one kind; with equal starts the shorter one is gone). The
one exception is the spec's own: a logged block put into the time of a live one that began before
it takes that time out of it (cut or split, "как в календаре"), and the sheet says so. A block run
alongside never clashes, nor does what an edit already shared before it (a rename of a live block
with lunch logged inside it).
*/
export const overlapOf = (
  time: TimeState,
  {
    now,
    range,
    target,
  }: { readonly target: SheetTarget; readonly range: ActivityRange; readonly now: string },
): Overlap => {
  const self = target.kind === "edit" ? time.activities[target.activityId] : undefined;
  if (self?.isAlongside === true) {
    return NO_OVERLAP;
  }
  const others = Object.values(time.activities).filter(
    (activity) => !activity.isAlongside && activity.id !== self?.id,
  );
  const how = { isLogged: self === undefined || self.isLogged, now };
  const shared = new Set(
    target.kind === "edit" ? clashesOf(others, target, how).map((clash) => clash.id) : [],
  );
  const clashes = clashesOf(others, range, how);
  const fresh = clashes.filter((clash) => !clash.isYielding && !shared.has(clash.id));
  return {
    next: fresh.some((clash) => clash.isLater),
    previous: fresh.some((clash) => !clash.isLater),
    yieldsFrom: clashes.find((clash) => clash.isYielding)?.label ?? null,
  };
};

/**
The draft refused where it would overlap: covering a later block is said under the end (under the
start for a running block, which has no end to type), cutting into an earlier one under the start.
*/
export const notOverlapping = (read: Read, overlap: Overlap, hasEndField: boolean): Read => {
  if (!overlap.next && !overlap.previous) {
    return read;
  }
  const isNextUnderEnd = overlap.next && hasEndField;
  return {
    faults: {
      ...read.faults,
      ...(overlap.previous && { from: "day.overlapsPrevious" }),
      ...(overlap.next && !isNextUnderEnd && { from: "day.overlapsNext" }),
      ...(isNextUnderEnd && { to: "day.overlapsNext" }),
    },
    range: null,
  };
};

export const hasFault = (faults: Faults): boolean =>
  faults.label !== null || faults.from !== null || faults.to !== null;
