import type { Language } from "../i18n/language.ts";
import type { CoreState } from "../materialize/core-state.ts";
import type { Weekday } from "../model/preset.ts";
import type { Task } from "../model/task.ts";
import type { SeriesSchedule } from "./series.ts";

import { formatShortDate, type MessageKey, plural, t } from "../i18n/i18n.ts";
import { ordinalCategory, type OrdinalCategory } from "../i18n/plural-rules.ts";
import { presetById } from "../presets/preset-reducer.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { formatInZone, wallClockInstant } from "../time.ts";
import { instanceWeekOf } from "./hw-instances.ts";
import { seriesById } from "./series-reducer.ts";

/**
How a task repeats, as a person reads it: a series' schedule with the weekday or the day of
the month it falls on, or a recurring homework preset's week. `until` is the inclusive last
local date of a series, `null` without one.
*/
export type RepeatRule =
  | { readonly kind: "daily"; readonly until: null | string }
  | { readonly kind: "every_n_days"; readonly days: number; readonly until: null | string }
  | { readonly kind: "monthly"; readonly day: number; readonly until: null | string }
  | { readonly kind: "weekdays"; readonly until: null | string }
  | { readonly kind: "weekly"; readonly weekday: Weekday; readonly until: null | string };

type Zoned = { readonly at: string; readonly tz: string };

/** The schedule with the weekday and the day of the month of `anchor`, read in its own zone. */
export const repeatRuleOf = (schedule: SeriesSchedule, anchor: Zoned): RepeatRule => {
  const until = schedule.until ?? null;
  switch (schedule.kind) {
    case "daily":
    case "weekdays": {
      return { kind: schedule.kind, until };
    }
    case "every_n_days": {
      return { kind: "every_n_days", days: schedule.days, until };
    }
    case "weekly": {
      return {
        kind: "weekly",
        weekday: Number(formatInZone(anchor.at, anchor.tz, "i")) as Weekday,
        until,
      };
    }
    case "monthly": {
      return { kind: "monthly", day: Number(formatInZone(anchor.at, anchor.tz, "d")), until };
    }
  }
};

/**
A series instance repeats while its series runs; its weekday and day of the month are the
template's deadline (else its start), which every instance's deadline keeps.
*/
const seriesRule = (state: Pick<CoreState, "series">, task: Task): null | RepeatRule => {
  const series = task.seriesId === null ? undefined : seriesById(state.series, task.seriesId);
  if (series === undefined || series.archived) {
    return null;
  }
  const { template } = series;
  const anchor =
    template.dueAt === undefined
      ? { at: template.startAt, tz: template.startTz }
      : { at: template.dueAt, tz: template.dueTz ?? template.startTz };
  return repeatRuleOf(series.schedule, anchor);
};

/** A weekly homework instance (`hw:<preset>:<week>`) repeats on its preset's due weekday. */
const homeworkRule = (state: Pick<CoreState, "presets">, task: Task): null | RepeatRule => {
  const ref = instanceWeekOf(task.id);
  if (ref === undefined || presetById(state.presets, ref.presetId)?.archived !== false) {
    return null;
  }
  const resolved = resolvePreset(state.presets, ref.presetId);
  return resolved.ok && resolved.value.recurrence !== null
    ? { kind: "weekly", weekday: resolved.value.recurrence.due.weekday, until: null }
    : null;
};

/** How the task repeats, or `null` for a one-off (and for an ended series). */
export const taskRepeatRule = (
  state: Pick<CoreState, "presets" | "series">,
  task: Task,
): null | RepeatRule => seriesRule(state, task) ?? homeworkRule(state, task);

const WEEKLY: Readonly<Record<Weekday, MessageKey>> = {
  1: "repeat.weekly.1",
  2: "repeat.weekly.2",
  3: "repeat.weekly.3",
  4: "repeat.weekly.4",
  5: "repeat.weekly.5",
  6: "repeat.weekly.6",
  7: "repeat.weekly.7",
};

const MONTHLY: Readonly<Record<OrdinalCategory, MessageKey>> = {
  one: "repeat.monthly.one",
  two: "repeat.monthly.two",
  few: "repeat.monthly.few",
  other: "repeat.monthly.other",
};

/** The shortest month has 28 days; the last day of every month is never past the 31st. */
const SHORTEST_MONTH = 28;
const LONGEST_MONTH = 31;

const monthlyText = (day: number, language: Language): string => {
  if (day >= LONGEST_MONTH) {
    return t(language, "repeat.monthlyLast");
  }
  const rule = t(language, MONTHLY[ordinalCategory(language, day)], { day });
  return day > SHORTEST_MONTH ? t(language, "repeat.shortMonths", { rule }) : rule;
};

const ruleText = (rule: RepeatRule, language: Language): string => {
  switch (rule.kind) {
    case "daily": {
      return t(language, "repeat.daily");
    }
    case "weekdays": {
      return t(language, "repeat.weekdays");
    }
    case "every_n_days": {
      return rule.days === 1
        ? t(language, "repeat.daily")
        : plural(language, rule.days, {
            few: t(language, "repeat.everyNDays.few"),
            many: t(language, "repeat.everyNDays.many"),
            one: t(language, "repeat.everyNDays.one"),
            other: t(language, "repeat.everyNDays.other"),
          });
    }
    case "weekly": {
      return t(language, WEEKLY[rule.weekday]);
    }
    case "monthly": {
      return monthlyText(rule.day, language);
    }
  }
};

export type RepeatTextContext = {
  readonly language: Language;
  /** Decides whether the last repeat date needs its year. */
  readonly now: string;
  /** The viewer's zone: the calendar "this year" is read on. */
  readonly tz: string;
};

/**
The rule in words: "Every month on the 31st", "Каждую пятницу, до 15 янв.". The grammar is in
the catalogs (Russian accusative weekdays, plural day counts, English ordinals).
*/
export const describeRepeatRule = (
  rule: RepeatRule,
  { language, now, tz }: RepeatTextContext,
): string => {
  const text = ruleText(rule, language);
  if (rule.until === null) {
    return text;
  }
  const date = formatShortDate(wallClockInstant(rule.until, "12:00", tz), now, { language, tz });
  return t(language, "repeat.until", { date, rule: text });
};
