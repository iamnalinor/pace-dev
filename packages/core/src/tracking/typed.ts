import { estimateOf } from "../input/quick-fields.ts";
import { findFirst, type Found, titleOf, toSpan } from "../input/quick-spans.ts";
import { addDaysIn, addMinutesIso, formatInZone, wallClockInstant } from "../time.ts";

/** What "What are you doing?" reads at once, before the assistant looks: the words and a length. */
export type TypedActivity = { readonly label: string; readonly expectMinutes: null | number };

/** "Пошёл в ЦСС, 20 мин" → the label "Пошёл в ЦСС", expected to take 20 minutes. */
export const typedActivity = (text: string): TypedActivity => {
  const estimate = estimateOf(text);
  const label = titleOf(
    text,
    estimate.spans.map((found) => toSpan(found)),
  );
  return { expectMinutes: estimate.minutes, label: label === "" ? text.trim() : label };
};

/** A stretch of time typed with its words: "7:30 - 8:30 - ходил в военкомат". */
export type TypedSpan = {
  readonly label: string;
  readonly startAt: string;
  readonly endAt: string;
};

/** "7:30 - 8:30", "7:30–8:30": both ends with minutes, so "7-8" is not a time. */
const DASHED = /(?<![\p{L}\p{N}])(\d{1,2})[:.](\d\d) ?[-–—] ?(\d{1,2})[:.](\d\d)(?!\p{N})/gu;
/** "с 7:30 до 8:30", "from 7 to 8:30": a bare hour counts after the words. */
const WORDED =
  /(?<![\p{L}\p{N}])(?:с|from) (\d{1,2})(?:[:.](\d\d))? (?:до|to|till|until) (\d{1,2})(?:[:.](\d\d))?(?!\p{N})/giu;

type Clock = { readonly hours: number; readonly minutes: number };

const clockOf = (hours = "0", minutes = "0"): Clock => ({
  hours: Number(hours),
  minutes: Number(minutes),
});

const isClock = ({ hours, minutes }: Clock): boolean => hours < 24 && minutes < 60;

const hhmm = ({ hours, minutes }: Clock): string =>
  `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

type At = { readonly now: string; readonly zone: string };

/** The wall clock `clock` on the day `days` from today in the zone. */
const onDay = ({ now, zone }: At, days: number, clock: Clock): string =>
  wallClockInstant(formatInZone(addDaysIn(now, days, zone), zone, "yyyy-MM-dd"), hhmm(clock), zone);

/**
Today's from–to; an end not after the start is the next day's (across midnight), and a block
that would start ahead of now is yesterday's: a typed span is time already begun.
*/
const placed = (at: At, from: Clock, to: Clock): null | { startAt: string; endAt: string } => {
  if (from.hours === to.hours && from.minutes === to.minutes) {
    return null;
  }
  const isOvernight = to.hours * 60 + to.minutes < from.hours * 60 + from.minutes;
  const days = onDay(at, 0, from) > at.now ? -1 : 0;
  return {
    endAt: onDay(at, days + (isOvernight ? 1 : 0), to),
    startAt: onDay(at, days, from),
  };
};

/** The words around a span, with a period at the end and dangling dashes taken off. */
const labelOf = (text: string, found: Found): string =>
  titleOf(text, [toSpan(found)])
    .replace(/\.$/u, "")
    .trim();

const clockSpan = (text: string, at: At): null | TypedSpan => {
  const found = findFirst(text, DASHED, "time") ?? findFirst(text, WORDED, "time");
  if (found === undefined) {
    return null;
  }
  const [, fromHours, fromMinutes, toHours, toMinutes] = found.match;
  const from = clockOf(fromHours, fromMinutes);
  const to = clockOf(toHours, toMinutes);
  const label = labelOf(text, found);
  const times = isClock(from) && isClock(to) ? placed(at, from, to) : null;
  return label === "" || times === null ? null : { label, ...times };
};

/** "20 мин читал": a length typed first is the time that just passed (one typed last is the Expect). */
const lengthSpan = (text: string, at: At): null | TypedSpan => {
  const estimate = estimateOf(text);
  const [found] = estimate.spans;
  if (
    found === undefined ||
    estimate.minutes === null ||
    text.slice(0, found.start).trim() !== ""
  ) {
    return null;
  }
  const label = labelOf(text, found);
  return label === ""
    ? null
    : { endAt: at.now, label, startAt: addMinutesIso(at.now, -estimate.minutes) };
};

/**
A block of time read from typed words on the account's clock: "7:30 - 8:30 - ходил в
военкомат", "с 7:30 до 8:30 …", "7:30-8:30 …", or a length typed first ("20 мин …"). `null`
when the words name no such block, or nothing but one.
*/
export const typedSpan = (text: string, at: At): null | TypedSpan =>
  clockSpan(text, at) ?? lengthSpan(text, at);
