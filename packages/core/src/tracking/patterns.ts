import type { ActivityCategory, TimeState } from "./model.ts";

import { addDaysIn, addMinutesIso, formatInZone, startOfDayIn } from "../time.ts";
import { FOCUS_CATEGORIES } from "./categories.ts";
import { type Range, type Segment, sumMinutes, timeline } from "./timeline.ts";

/** A focus block shorter than this is a fragment: started, then interrupted. */
export const SHORT_FOCUS_MINUTES = 15;

const MS_PER_MINUTE = 60_000;
const HOURS = 24;

type ZonedRange = Range & { readonly zone: string };

const isFocus = (category: ActivityCategory): boolean => FOCUS_CATEGORIES.has(category);

const focusSegments = (time: TimeState, range: Range): readonly Segment[] =>
  timeline(time, range).segments.filter((segment) => isFocus(segment.category));

type HourPiece = { readonly hour: number; readonly minutes: number };

/** The minutes of one segment by local hour of day: pieces up to each hour boundary. */
const byHour = (segment: Segment, zone: string): readonly HourPiece[] => {
  const end = Date.parse(segment.endAt);
  const from = (cursor: number): readonly HourPiece[] => {
    if (cursor >= end) {
      return [];
    }
    const iso = new Date(cursor).toISOString();
    const intoHour =
      Number(formatInZone(iso, zone, "m")) * MS_PER_MINUTE + (cursor % MS_PER_MINUTE);
    const boundary = Math.min(end, cursor - intoHour + 60 * MS_PER_MINUTE);
    return [
      { hour: Number(formatInZone(iso, zone, "H")), minutes: (boundary - cursor) / MS_PER_MINUTE },
      ...from(boundary),
    ];
  };
  return from(Date.parse(segment.startAt));
};

/** Focus minutes (work, study, tasks) by local hour of day over the range: 24 numbers, 0:00 first. */
export const productiveHours = (time: TimeState, range: ZonedRange): readonly number[] => {
  const pieces = focusSegments(time, range).flatMap((segment) => byHour(segment, range.zone));
  return Array.from({ length: HOURS }, (_, hour) =>
    Math.round(sumMinutes(pieces.filter((piece) => piece.hour === hour))),
  );
};

const median = (values: readonly number[]): null | number => {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export type Fragmentation = {
  readonly focusBlocks: number;
  /** The typical uninterrupted focus block; `null` without any. */
  readonly medianFocusMinutes: null | number;
  /** 0..1 of the focus blocks shorter than 15 minutes. */
  readonly shortFocusShare: null | number;
  /** Switches from one activity to the next, per day with anything tracked. */
  readonly switchesPerDay: null | number;
};

/** How broken up the time was: block lengths, fragments, switches. */
export const fragmentation = (time: TimeState, range: ZonedRange): Fragmentation => {
  const { segments } = timeline(time, range);
  const focus = segments.filter((segment) => isFocus(segment.category));
  const days = Map.groupBy(segments, (segment) =>
    formatInZone(segment.startAt, range.zone, "yyyy-MM-dd"),
  );
  const switches = days
    .values()
    .map((day) => day.length - 1)
    .toArray();
  return {
    focusBlocks: focus.length,
    medianFocusMinutes: median(focus.map((segment) => segment.minutes)),
    shortFocusShare:
      focus.length === 0
        ? null
        : focus.filter((segment) => segment.minutes < SHORT_FOCUS_MINUTES).length / focus.length,
    switchesPerDay:
      switches.length === 0
        ? null
        : sumMinutes(switches.map((count) => ({ minutes: count }))) / switches.length,
  };
};

export type FocusSleepDay = {
  /** Midnight of the day in the zone. */
  readonly date: string;
  /** Sleep logged for the night before (ending between 18:00 the day before and 14:00); `null` without any. */
  readonly sleepMinutes: null | number;
  readonly focusMinutes: number;
};

/** The night before a day ends in this window around its morning. */
const NIGHT_ENDS_FROM_MINUTES = -6 * 60;
const NIGHT_ENDS_UNTIL_MINUTES = 14 * 60;

/** Midnight of each day from `date` on, inside the range and not after now. */
const dayStarts = (date: string, range: ZonedRange): readonly string[] =>
  date < range.to && date <= range.now
    ? [date, ...dayStarts(addDaysIn(date, 1, range.zone), range)]
    : [];

/** Each day of the range: the sleep of the night before against the focus time of the day. */
export const focusVsSleep = (time: TimeState, range: ZonedRange): readonly FocusSleepDay[] => {
  const first = startOfDayIn(range.from, range.zone);
  const sleepSpan = timeline(time, {
    from: addMinutesIso(first, -24 * 60),
    now: range.now,
    to: range.to,
  }).segments.filter((segment) => segment.category === "sleep");
  return dayStarts(first, range).map((date) => {
    const from = addMinutesIso(date, NIGHT_ENDS_FROM_MINUTES);
    const until = addMinutesIso(date, NIGHT_ENDS_UNTIL_MINUTES);
    const night = sleepSpan.filter((segment) => segment.endAt > from && segment.endAt <= until);
    return {
      date,
      focusMinutes: sumMinutes(
        focusSegments(time, { from: date, now: range.now, to: addDaysIn(date, 1, range.zone) }),
      ),
      sleepMinutes: night.length === 0 ? null : sumMinutes(night),
    };
  });
};
