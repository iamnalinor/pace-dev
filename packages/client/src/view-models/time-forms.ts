import type { ActivityCategory } from "@pace/core";

import type { ActivityEntry, ActivityTarget } from "../actions/time-actions.ts";
import type { DayRow } from "./day.ts";

/** The block's end can be typed: a new block always, an existing one once it has ended. */
export const hasEnd = (target: ActivityTarget): boolean =>
  target.kind === "log" || target.endAt !== null;

/** The Day sheet's fields as typed; times stay text in the platform's own format. */
export type ActivityForm = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly expectMinutes: null | number;
  readonly taskId: null | string;
  readonly from: string;
  readonly to: string;
  /**
  The calendar day (`yyyy-MM-dd` in the sheet's zone) the person put the start or the end on;
  `null` while only the clock was typed, and the sheet reads the day from the block itself.
  */
  readonly fromDay: null | string;
  readonly toDay: null | string;
};

/** The sheet's starting fields; `clock` writes an instant the way the platform's time input reads it. */
export const activityFormOf = (
  target: ActivityTarget,
  clock: (atIso: string) => string,
): ActivityForm => ({
  category: target.kind === "edit" ? target.category : "other",
  expectMinutes: target.kind === "edit" ? (target.expectMinutes ?? null) : null,
  taskId: target.kind === "edit" ? (target.taskId ?? null) : null,
  from: clock(target.startAt),
  fromDay: null,
  label: target.kind === "edit" ? target.label : "",
  to: target.endAt === null ? "" : clock(target.endAt),
  toDay: null,
});

/** The Day sheet's inputs: what it edits, the zone its times are typed in, and how it closes. */
export type ActivitySheetProps = {
  readonly target: ActivityTarget;
  readonly zone: string;
  readonly onClose: () => void;
};

/** A block on the Day timeline as a row: its zone for the clock times and its tap. */
export type DayRowProps = {
  readonly row: DayRow;
  readonly zone: string;
  readonly onEdit: () => void;
};

/** A part of a form: the fields it shows and the setter that merges the edited ones in. */
export type FormPartProps<T> = {
  readonly draft: T;
  readonly patch: (next: Partial<T>) => void;
};

/** The sheet's typed times as instants; the end is `null` for a block still running. */
export type ActivityRange = Pick<ActivityEntry, "endAt" | "startAt">;

export type TypedTime = {
  /** What the field shows: digits with the colon put in for the person ("1405" → "14:05"). */
  readonly text: string;
  /** Four digits that make a real time: focus can move on to the next field. */
  readonly isComplete: boolean;
};

const MAX_HOUR = 23;
const MAX_MINUTE = 59;

/** One or two digits of an hour, a separator a person types between hour and minutes, the minutes. */
const SEPARATED = /^(\d{1,2})(?:\s*[:.,hч]\s*|\s+)(\d{0,2})$/iu;
/** Only digits. */
const DIGITS = /^\d*$/u;
/** A first digit that cannot start a two-digit hour: the hour on its own. */
const HOUR_ALONE = /^[3-9]/u;
/** Four digits at most: the hour and the minutes. */
const MAX_DIGITS = 4;

const typed = (hours: string, minutes: string): TypedTime => ({
  isComplete:
    hours.length === 2 &&
    minutes.length === 2 &&
    Number(hours) <= MAX_HOUR &&
    Number(minutes) <= MAX_MINUTE,
  text: `${hours}:${minutes}`,
});

/** The first of `length` positions at which `isDifferent` holds, or `length` when none does. */
const firstDiffering = (length: number, isDifferent: (index: number) => boolean): number =>
  Array.from({ length }, (_, index) => index).find((index) => isDifferent(index)) ?? length;

/** How many characters a change put in: what is left between the text kept before and after it. */
const insertedLength = (previous: string, raw: string): number => {
  const shorter = Math.min(previous.length, raw.length);
  const head = firstDiffering(shorter, (index) => previous[index] !== raw[index]);
  const tail = firstDiffering(
    shorter - head,
    (index) => previous[previous.length - 1 - index] !== raw[raw.length - 1 - index],
  );
  return raw.length - head - tail;
};

/** Text that is not a time as it stands: kept as typed, never complete. */
const asTyped = (raw: string): TypedTime => ({ isComplete: false, text: raw });

/** An hour and minutes around a separator; a one-digit hour is filled out when `isFilledOut`. */
const readSeparated = (hours: string, minutes: string, isFilledOut: boolean): TypedTime =>
  isFilledOut || hours.length === 2
    ? typed(hours.padStart(2, "0"), minutes)
    : { isComplete: false, text: `${hours}:${minutes}` };

/** Digits alone: the colon after the hour; a first digit above 2 is the hour when text came in. */
const readDigits = (plain: string, isInserted: boolean): TypedTime => {
  if (plain.length > MAX_DIGITS) {
    return asTyped(plain);
  }
  const isHourAlone = isInserted && HOUR_ALONE.test(plain) && plain.length < MAX_DIGITS;
  const digits = isHourAlone ? `0${plain}` : plain;
  return digits.length > 2
    ? typed(digits.slice(0, 2), digits.slice(2))
    : { isComplete: false, text: digits };
};

/**
Quick time entry, one parser for every time field. Digits alone get the colon by themselves and
a first digit above 2 is an hour on its own ("9" → "09", "930" → 09:30). An hour typed before a
separator is that hour: «9:30», «9.30», «9 30», «9h30» are 09:30, and "1" then ":" is 01 (QA round
25 R25-04). Anything else after the minutes («9:30 PM», «12:345», five digits) is not a time and
stays as typed, incomplete (QA-25 review M4).

`previous` is the text the field showed before this change. A one-digit hour is filled out only
when the change put text in: a paste, a first digit above 2, or the separator just typed after the
hour. Deleting a digit inside a filled «09:30» leaves «0:30» as typed, incomplete, never a complete
wrong 00:30 (QA-25 review I1); one key typed in front of «:30» leaves «1:30» until the second digit
comes. Without `previous` the text is read whole, the way a field reads it when it is left or saved.
*/
export const typeTime = (raw: string, previous?: string): TypedTime => {
  if (previous !== undefined && isSecondSeparator(raw, previous)) {
    // «09:9» and then «:»: one separator is all a time has (QA round 27 R27-04).
    return typeTime(previous);
  }
  const text = raw.trim();
  const inserted = previous === undefined ? text.length : insertedLength(previous, raw);
  const separated = SEPARATED.exec(text);
  if (separated !== null) {
    const [, hours = "", minutes = ""] = separated;
    return readSeparated(hours, minutes, inserted > 1 || (inserted === 1 && minutes === ""));
  }
  return DIGITS.test(text) ? readDigits(text, inserted > 0) : asTyped(raw);
};

/** A separator typed into a text that has one already. */
const isSecondSeparator = (raw: string, previous: string): boolean =>
  raw.length > previous.length && separatorsIn(raw) > 1 && separatorsIn(previous) === 1;

const separatorsIn = (text: string): number => text.match(/[:.,hч]/giu)?.length ?? 0;

const HOUR_ONLY = /^(\d{1,2}):?$/u;

/**
A field's text read whole, the way it is read when the field is left or its form saved: as
`typeTime` reads it, and an hour typed alone («7», «14», «7:») is that hour sharp (QA round 27
R27-04, offered in round 26).
*/
export const readTime = (text: string): TypedTime => {
  const whole = typeTime(text);
  const hour = HOUR_ONLY.exec(text.trim())?.[1];
  return hour === undefined || whole.isComplete || Number(hour) > MAX_HOUR
    ? whole
    : { isComplete: true, text: `${hour.padStart(2, "0")}:00` };
};
