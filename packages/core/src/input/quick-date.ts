import { tz } from "@date-fns/tz";
import { addYears, set } from "date-fns";

import { startOfDayIn } from "../time.ts";
import { findAll, type Found } from "./quick-spans.ts";

/** A month by its name: the Russian genitive ("12 октября") or English, full or short. */
const MONTHS: Readonly<Record<string, number>> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/** "12 октября", "12 October". */
const DAY_MONTH = /(?<![\p{L}\p{N}])([0-3]?\d) (\p{L}+)(?![\p{L}\p{N}])/gu;
/** "October 12" (not "October 12:30", which is a time). */
const MONTH_DAY = /(?<![\p{L}\p{N}])(\p{L}+) ([0-3]?\d)(?![\p{L}\p{N}:.])/gu;

const LAST_DAY = 31;

type DayOfYear = { readonly day: number; readonly month: number };

const monthOf = (word: string | undefined): number | undefined =>
  word === undefined ? undefined : MONTHS[word.toLowerCase()];

const isDay = (value: number): boolean => value >= 1 && value <= LAST_DAY;

/** The day and the month a found date names (either order). */
export const dateOf = ({ match }: Found): DayOfYear => {
  const [, first = "", second = ""] = match;
  const monthAfter = monthOf(second);
  return monthAfter === undefined
    ? { day: Number(second), month: monthOf(first) ?? 1 }
    : { day: Number(first), month: monthAfter };
};

/** A date by the month's name, the first in the text: "12 октября", "October 12". */
export const findDate = (text: string): Found | undefined =>
  [...findAll(text, DAY_MONTH, "due"), ...findAll(text, MONTH_DAY, "due")]
    .filter(
      (found) =>
        (monthOf(found.match[2]) !== undefined || monthOf(found.match[1]) !== undefined) &&
        isDay(dateOf(found).day),
    )
    .toSorted((a, b) => a.start - b.start)
    .at(0);

/** That date at a wall-clock time in `zone`: this year, or the next once it has passed. */
export const atDate = (
  { now, zone }: { readonly now: string; readonly zone: string },
  { day, month }: DayOfYear,
  clock: { readonly hours: number; readonly minutes: number },
): string => {
  const context = { in: tz(zone) };
  const today = startOfDayIn(now, zone);
  const wall = { hours: clock.hours, milliseconds: 0, minutes: clock.minutes, seconds: 0 };
  const thisYear = set(today, { ...wall, date: day, month: month - 1 }, context);
  const date = new Date(thisYear).toISOString() < today ? addYears(thisYear, 1, context) : thisYear;
  return new Date(date).toISOString();
};
