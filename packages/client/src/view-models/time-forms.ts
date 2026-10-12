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
  readonly from: string;
  readonly to: string;
};

/** The sheet's starting fields; `clock` writes an instant the way the platform's time input reads it. */
export const activityFormOf = (
  target: ActivityTarget,
  clock: (atIso: string) => string,
): ActivityForm => ({
  category: target.kind === "edit" ? target.category : "other",
  from: clock(target.startAt),
  label: target.kind === "edit" ? target.label : "",
  to: target.endAt === null ? "" : clock(target.endAt),
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

/**
Quick time entry from digits only: the colon appears by itself, a first digit above 2 is an
hour on its own ("9" → "09"), and the time is complete after the minutes.
*/
export const typeTime = (raw: string): TypedTime => {
  const typed = raw.replaceAll(/\D/gu, "");
  const digits = (typed.length === 1 && typed > "2" ? `0${typed}` : typed).slice(0, 4);
  const text = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2));
  return { isComplete: digits.length === 4 && hours <= MAX_HOUR && minutes <= MAX_MINUTE, text };
};
