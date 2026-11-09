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

/** One or two digits of an hour, a separator a person types between hour and minutes, the rest. */
const SEPARATED = /^\s*(\d{1,2})\s*[:.,hч\s]\s*(\d{0,2})/iu;

const typed = (hours: string, minutes: string): TypedTime => ({
  isComplete: minutes.length === 2 && Number(hours) <= MAX_HOUR && Number(minutes) <= MAX_MINUTE,
  text: `${hours}:${minutes}`,
});

/**
Quick time entry: digits alone get the colon by themselves, a first digit above 2 is an hour on
its own ("9" → "09"), and the time is complete after the minutes. An hour typed before a
separator is that hour, as typed or pasted whole: «9:30», «9.30», «9 30», «9h30» are 09:30, and
"1" then ":" is 01 (QA round 25 R25-04: «9:30» read as 93:0). One parser for every time field.
*/
export const typeTime = (raw: string): TypedTime => {
  const separated = SEPARATED.exec(raw);
  if (separated !== null) {
    const [, hours = "", minutes = ""] = separated;
    return typed(hours.padStart(2, "0"), minutes);
  }
  const plain = raw.replaceAll(/\D/gu, "");
  const digits = (plain.length === 1 && plain > "2" ? `0${plain}` : plain).slice(0, 4);
  return digits.length > 2
    ? typed(digits.slice(0, 2), digits.slice(2))
    : { isComplete: false, text: digits };
};
