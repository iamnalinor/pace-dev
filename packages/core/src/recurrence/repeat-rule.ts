import type { Language } from "../i18n/language.ts";
import type { CoreState } from "../materialize/core-state.ts";
import type { Weekday } from "../model/preset.ts";
import type { Task } from "../model/task.ts";
import type { QueryContext } from "../queries/context.ts";

import { formatShortDate, type MessageKey, plural, t } from "../i18n/i18n.ts";
import { ordinalCategory, type OrdinalCategory } from "../i18n/plural-rules.ts";
import { presetById } from "../presets/preset-reducer.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { formatInZone, wallClockInstant } from "../time.ts";
import { instanceWeekOf } from "./hw-instances.ts";
import { type Series, seriesById } from "./series-reducer.ts";
import { nextSeriesSlot, type SeriesSchedule } from "./series.ts";

/**
How a task repeats, as a person reads it: a series' schedule with the weekday or the day of
the month it falls on, or a recurring homework preset's week. `until` is the inclusive last
local date of a series, `null` without one; `isLast` marks the instance no repeat follows.
*/
export type RepeatRule = (
  | { readonly kind: "daily" }
  | { readonly kind: "every_n_days"; readonly days: number }
  | { readonly kind: "monthly"; readonly day: number }
  | { readonly kind: "weekdays" }
  | { readonly kind: "weekly"; readonly weekday: Weekday }
) & { readonly until: null | string; readonly isLast?: boolean };

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
The zone the task screen shows the deadline in (else the start): the zone it was set in, else
the device's. The rule's weekday and day are read there, so "Every Friday" sits next to a Friday.
*/
const shownZone = (task: Task, ctx: QueryContext): string =>
  (task.dueAt === null ? task.startTz : task.dueTz) ?? ctx.deviceTz;

/** No repeat after this instance: the next slot after its own start is past the last date. */
const isLastInstance = (series: Series, task: Task): boolean =>
  series.schedule.until !== undefined &&
  task.startAt !== null &&
  nextSeriesSlot(series.template.startAt, series.schedule, {
    after: task.startAt,
    zone: series.template.startTz,
  }) === null;

/** Still ahead: its deadline (else its start) has not come yet. */
const isAhead = (task: Task, now: string): boolean => {
  const at = task.dueAt ?? task.startAt;
  return at !== null && Date.parse(at) > Date.parse(now);
};

/**
A series instance repeats while its series runs: not ended, and not past its last repeat date
unless the instance itself is still ahead (it then reads as the last one). Its weekday and day
of the month are the template's deadline (else its start), which every instance keeps.
*/
const seriesRule = (
  state: Pick<CoreState, "series">,
  task: Task,
  ctx: QueryContext,
): null | RepeatRule => {
  const series = task.seriesId === null ? undefined : seriesById(state.series, task.seriesId);
  if (series === undefined || series.archived) {
    return null;
  }
  const { schedule, template } = series;
  const zone = template.startTz;
  const isPast =
    schedule.until !== undefined && schedule.until < formatInZone(ctx.now, zone, "yyyy-MM-dd");
  if (isPast && !isAhead(task, ctx.now)) {
    return null;
  }
  const anchor = { at: template.dueAt ?? template.startAt, tz: shownZone(task, ctx) };
  return { ...repeatRuleOf(schedule, anchor), isLast: isLastInstance(series, task) };
};

/**
A weekly homework instance (`hw:<preset>:<week>`) repeats on its preset's due weekday, read
off its own deadline in the zone that deadline is shown in.
*/
const homeworkRule = (
  state: Pick<CoreState, "presets">,
  task: Task,
  ctx: QueryContext,
): null | RepeatRule => {
  const ref = instanceWeekOf(task.id);
  if (ref === undefined || presetById(state.presets, ref.presetId)?.archived !== false) {
    return null;
  }
  const resolved = resolvePreset(state.presets, ref.presetId);
  if (!resolved.ok || resolved.value.recurrence === null) {
    return null;
  }
  const weekday =
    task.dueAt === null
      ? resolved.value.recurrence.due.weekday
      : (Number(formatInZone(task.dueAt, shownZone(task, ctx), "i")) as Weekday);
  return { isLast: false, kind: "weekly", weekday, until: null };
};

/** How the task repeats as of `ctx.now`, or `null` for a one-off and for a series that ended. */
export const taskRepeatRule = (
  state: Pick<CoreState, "presets" | "series">,
  task: Task,
  ctx: QueryContext,
): null | RepeatRule => seriesRule(state, task, ctx) ?? homeworkRule(state, task, ctx);

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
  if (rule.isLast === true) {
    return t(language, "repeat.last", { rule: text });
  }
  if (rule.until === null) {
    return text;
  }
  const date = formatShortDate(wallClockInstant(rule.until, "12:00", tz), now, { language, tz });
  return t(language, "repeat.until", { date, rule: text });
};
