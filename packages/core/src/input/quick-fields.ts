import { tz } from "@date-fns/tz";
import { addDays, set } from "date-fns";

import type { CoreState } from "../materialize/core-state.ts";
import type { Importance } from "../model/preset.ts";

import { formatInZone, startOfDayIn } from "../time.ts";
import { findAll, findFirst, type Found } from "./quick-spans.ts";

export type QuickSubtask = { readonly label: string; readonly number: null | number };

/** A word on its own: a letter or digit on neither side. */
const WORD = /(?<![\p{L}\p{N}])\p{L}+(?![\p{L}\p{N}])/gu;
const TIME_HM = /(?<![\p{L}\p{N}])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\p{L}\p{N}])/gu;
const TIME_AMPM = /(?<![\p{L}\p{N}])(1[0-2]|0?[1-9]) ?(am|pm)(?![\p{L}\p{N}])/giu;
const BARE_HOUR = /(?<![\p{L}\p{N}])([01]?\d|2[0-3])(?![\p{L}\p{N}:.])/gu;
/** A number with a unit word right after it: "1ч", "1.5 h", "30 мин". */
const AMOUNT = /(?<![\p{L}\p{N}])(\d{1,3}[.,]\d{1,2}|\d{1,3}) ?(\p{L}+)(?![\p{L}\p{N}])/gu;
const MINUTES_PER_UNIT: Readonly<Record<string, number>> = {
  ч: 60,
  час: 60,
  часа: 60,
  часов: 60,
  h: 60,
  hr: 60,
  hrs: 60,
  hour: 60,
  hours: 60,
  м: 1,
  мин: 1,
  минут: 1,
  минуты: 1,
  минута: 1,
  m: 1,
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
};
const HALF_HOUR = /(?<![\p{L}\p{N}])(?:полчаса|half an hour)(?![\p{L}\p{N}])/giu;
const IMPORTANCE_PATTERNS: readonly (readonly [Importance, RegExp])[] = [
  ["asap", /(?<![\p{L}\p{N}])(?:срочно|asap|urgent|urgently)(?![\p{L}\p{N}])/giu],
  [
    "prioritized",
    /(?<![\p{L}\p{N}])(?:важно|приоритетно|priority|prioritized|important)(?![\p{L}\p{N}])/giu,
  ],
  ["nice_to_have", /(?<![\p{L}\p{N}])(?:потом|когда-нибудь|someday|later)(?![\p{L}\p{N}])/giu],
];
const PROJECT_TAG = /(?<![\p{L}\p{N}])#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;
/** One numbered problem, optionally lettered: "5", "5а". */
const PROBLEM = /(?<![\p{L}\p{N}])\d{1,3}\p{L}?(?![\p{L}\p{N}])/gu;
/** What may stand between two problems of one list. */
const PROBLEM_GAP = /^(?:, ?| и | and )$/u;
const PROBLEM_WORD = /(?<![\p{L}\p{N}])(?:задача|задачи|номер|problem|problems|№) ?$/iu;

const DAY_PREPOSITION = /(?<![\p{L}\p{N}])(?:до|к|ко|в|во|на|by|on|until|due) $/iu;
const TIME_PREPOSITION = /(?<![\p{L}\p{N}])(?:в|к|до|at|by) $/iu;

/** Widens a span over the preposition right before it ("до среды", "at 6pm"). */
const withPreposition = (text: string, found: Found, preposition: RegExp): Found => {
  const before = preposition.exec(text.slice(0, found.start));
  return before === null ? found : { ...found, start: before.index };
};

/** A time of day: "18:00", "в 18", "at 6pm". A bare number counts only after a preposition. */
export const findTime = (text: string): Found | undefined => {
  const time =
    findFirst(text, TIME_HM, "time") ??
    findFirst(text, TIME_AMPM, "time") ??
    findAll(text, BARE_HOUR, "time").find((hour) =>
      TIME_PREPOSITION.test(text.slice(0, hour.start)),
    );
  return time === undefined ? undefined : withPreposition(text, time, TIME_PREPOSITION);
};

const WEEKDAY_STEMS: readonly (readonly [number, readonly string[]])[] = [
  [1, ["понедельник", "monday"]],
  [2, ["вторник", "tuesday"]],
  [3, ["сред", "wednesday"]],
  [4, ["четверг", "thursday"]],
  [5, ["пятниц", "friday"]],
  [6, ["суббот", "saturday"]],
  [7, ["воскресень", "sunday"]],
];

const RELATIVE_DAYS: Readonly<Record<string, number>> = {
  сегодня: 0,
  today: 0,
  завтра: 1,
  tomorrow: 1,
  послезавтра: 2,
};

const DAYS_PER_WEEK = 7;

/** At most two letters of case ending after the stem: "среды" is a day, "средний" is not. */
const ENDING_LENGTH = 2;

const weekdayOf = (word: string): number | undefined =>
  WEEKDAY_STEMS.find(([, stems]) =>
    stems.some((stem) => word.startsWith(stem) && word.length - stem.length <= ENDING_LENGTH),
  )?.[0];

const isDayWord = (word: string): boolean => {
  const lower = word.toLowerCase();
  return RELATIVE_DAYS[lower] !== undefined || weekdayOf(lower) !== undefined;
};

/** A day word with its preposition: "до среды", "tomorrow", "on friday". */
export const findDay = (text: string): Found | undefined => {
  const day = findAll(text, WORD, "due").find((word) => isDayWord(word.match[0]));
  return day === undefined ? undefined : withPreposition(text, day, DAY_PREPOSITION);
};

/** Days from today to the named day; a weekday that is today counts as today. */
const daysAheadOf = (word: string, now: string, zone: string): number => {
  const lower = word.toLowerCase();
  const relative = RELATIVE_DAYS[lower];
  if (relative !== undefined) {
    return relative;
  }
  const weekday = weekdayOf(lower);
  const today = Number(formatInZone(now, zone, "i"));
  return weekday === undefined ? 0 : (weekday - today + DAYS_PER_WEEK) % DAYS_PER_WEEK;
};

type Clock = { readonly hours: number; readonly minutes: number };

const NOON = 12;

const clockOf = ({ match }: Found): Clock => {
  const [whole, first = "0", second = ""] = match;
  const hours = Number(first);
  if (/\d[:.]\d/u.test(whole)) {
    return { hours, minutes: Number(second) };
  }
  const suffix = second.toLowerCase();
  if (suffix === "pm") {
    return { hours: hours < NOON ? hours + NOON : hours, minutes: 0 };
  }
  return { hours: suffix === "am" && hours === NOON ? 0 : hours, minutes: 0 };
};

const END_OF_DAY: Clock = { hours: 23, minutes: 59 };

type Zoned = { readonly now: string; readonly zone: string };

const atClock = ({ now, zone }: Zoned, days: number, clock: Clock): string => {
  const context = { in: tz(zone) };
  const day = addDays(startOfDayIn(now, zone), days, context);
  const wall = { hours: clock.hours, milliseconds: 0, minutes: clock.minutes, seconds: 0 };
  return new Date(set(day, wall, context)).toISOString();
};

/** The due from a day and a time; a bare time that has already passed means tomorrow. */
export const dueOf = (
  found: { readonly day: Found | undefined; readonly time: Found | undefined },
  at: Zoned,
): null | string => {
  const { day, time } = found;
  if (day === undefined && time === undefined) {
    return null;
  }
  const clock = time === undefined ? END_OF_DAY : clockOf(time);
  const days = day === undefined ? 0 : daysAheadOf(day.match[0], at.now, at.zone);
  const due = atClock(at, days, clock);
  return day === undefined && due <= at.now ? atClock(at, 1, clock) : due;
};

const HALF_HOUR_MINUTES = 30;

type Estimate = { readonly minutes: null | number; readonly spans: readonly Found[] };

const unitOf = (found: Found): number | undefined =>
  MINUTES_PER_UNIT[(found.match[2] ?? "").toLowerCase()];

export const estimateOf = (text: string): Estimate => {
  const amount = findAll(text, AMOUNT, "estimate").find((found) => unitOf(found) !== undefined);
  if (amount !== undefined) {
    const value = Number((amount.match[1] ?? "0").replace(",", "."));
    return { minutes: Math.round(value * (unitOf(amount) ?? 1)), spans: [amount] };
  }
  const half = findFirst(text, HALF_HOUR, "estimate");
  return half === undefined
    ? { minutes: null, spans: [] }
    : { minutes: HALF_HOUR_MINUTES, spans: [half] };
};

type NamedImportance = { readonly importance: Importance | null; readonly spans: readonly Found[] };

/** The first importance word wins; every importance word leaves the title. */
export const importanceOf = (text: string): NamedImportance => {
  const hits = IMPORTANCE_PATTERNS.flatMap(([importance, pattern]) =>
    findAll(text, pattern, "importance").map((found) => ({ found, importance })),
  ).toSorted((a, b) => a.found.start - b.found.start);
  return {
    importance: hits[0]?.importance ?? null,
    spans: hits.map((hit) => hit.found),
  };
};

type Problems = { readonly subtasks: readonly QuickSubtask[]; readonly spans: readonly Found[] };

const toSubtask = (label: string): QuickSubtask => ({
  label,
  number: /^\d+$/u.test(label) ? Number(label) : null,
});

/** Runs of problems joined by commas or "и"/"and", in order. */
const problemRuns = (text: string): readonly (readonly Found[])[] => {
  const problems = findAll(text, PROBLEM, "subtasks");
  const starts = problems
    .map((problem, index) => ({ index, problem }))
    .filter(({ index, problem }) => {
      const previous = problems[index - 1];
      return previous === undefined || !PROBLEM_GAP.test(text.slice(previous.end, problem.start));
    })
    .map(({ index }) => index);
  return starts.map((start, position) => problems.slice(start, starts[position + 1]));
};

/** A list of two or more problems, or one problem after a word like "задача". */
export const problemsOf = (text: string): Problems => {
  const run = problemRuns(text).find(
    (problems) =>
      problems.length > 1 ||
      (problems[0] !== undefined && PROBLEM_WORD.test(text.slice(0, problems[0].start))),
  );
  const first = run?.[0];
  const last = run?.at(-1);
  if (run === undefined || first === undefined || last === undefined) {
    return { spans: [], subtasks: [] };
  }
  const span = { ...first, end: last.end };
  const withWord = withPreposition(text, span, PROBLEM_WORD);
  return {
    spans: [withWord],
    subtasks: run.map((problem) => toSubtask(problem.match[0])),
  };
};

type ProjectTag = {
  readonly projectId: null | string;
  readonly projectName: null | string;
  readonly spans: readonly Found[];
};

/** `#name`: an existing project by name, or the name of one to create. */
export const projectTagOf = (state: CoreState, text: string): ProjectTag => {
  const tag = findFirst(text, PROJECT_TAG, "project");
  if (tag === undefined) {
    return { projectId: null, projectName: null, spans: [] };
  }
  const name = tag.match[1] ?? "";
  const existing = Object.values(state.projects.byId).find(
    (project) => !project.archived && project.name.toLowerCase() === name.toLowerCase(),
  );
  return {
    projectId: existing?.id ?? null,
    projectName: existing === undefined ? name : null,
    spans: [tag],
  };
};
