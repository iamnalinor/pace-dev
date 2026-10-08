import {
  accountTz,
  type ActivityCategory,
  addDaysIn,
  CATEGORY_COLORS,
  type CoreState,
  type EstimateRow,
  estimateVsTracked,
  type FocusSleepDay,
  focusVsSleep,
  type Fragmentation,
  fragmentation,
  onTimeByProject,
  productiveHours,
  projectById,
  type ProjectColorName,
  type QueryContext,
  startOfWeekIn,
  timeByCategory,
  timeByProject,
} from "@pace/core";

export type InsightBar = {
  /** A category, a project id, or `null` for the time with no project. */
  readonly key: null | string;
  /** The project's name; categories and "no project" are translated by the UI. */
  readonly name: null | string;
  readonly color: null | ProjectColorName;
  readonly minutes: number;
  /** 0..1 of the largest bar, for drawing. */
  readonly share: number;
};

export type OnTimeView = {
  readonly projectId: null | string;
  readonly name: null | string;
  readonly color: null | ProjectColorName;
  readonly onTime: number;
  readonly total: number;
};

export type InsightsModel = {
  /** Monday 00:00 of the week in the account zone. */
  readonly weekStart: string;
  readonly previous: string;
  /** `null` for the current week. */
  readonly next: null | string;
  readonly totalMinutes: number;
  readonly byCategory: readonly InsightBar[];
  readonly byProject: readonly InsightBar[];
  readonly onTime: readonly OnTimeView[];
  readonly estimates: readonly EstimateRow[];
  /** Focus minutes by local hour of day (24 values) and the busiest hour, if any. */
  readonly hours: { readonly minutes: readonly number[]; readonly peak: null | number };
  readonly fragmentation: Fragmentation;
  /** Each day of the week so far: the night before against the day's focus, with bar shares. */
  readonly focusSleep: readonly (FocusSleepDay & {
    readonly sleepShare: number;
    readonly focusShare: number;
  })[];
};

const peakOf = (minutes: readonly number[]): null | number => {
  const most = Math.max(...minutes);
  return most > 0 ? minutes.indexOf(most) : null;
};

/** Each measure scaled to its own largest value: two charts side by side, never one shared axis. */
const withDayShares = (days: readonly FocusSleepDay[]): InsightsModel["focusSleep"] => {
  const sleepMost = Math.max(1, ...days.map((day) => day.sleepMinutes ?? 0));
  const focusMost = Math.max(1, ...days.map((day) => day.focusMinutes));
  return days.map((day) => ({
    ...day,
    focusShare: day.focusMinutes / focusMost,
    sleepShare: (day.sleepMinutes ?? 0) / sleepMost,
  }));
};

const withShares = (bars: readonly Omit<InsightBar, "share">[]): readonly InsightBar[] => {
  const largest = Math.max(1, ...bars.map((bar) => bar.minutes));
  return bars.map((bar) => ({ ...bar, share: bar.minutes / largest }));
};

const projectLabel = (state: CoreState, projectId: null | string) => {
  const project = projectId === null ? undefined : projectById(state.projects, projectId);
  return { color: project?.color ?? null, name: project?.name ?? null };
};

/** One week of the ledger: where the time went, what was on time, plan against fact. */
export const insightsModel = (
  state: CoreState,
  weekOf: null | string,
  ctx: QueryContext,
): InsightsModel => {
  const zone = accountTz(state, ctx);
  const thisWeek = startOfWeekIn(ctx.now, zone);
  const from = weekOf === null ? thisWeek : startOfWeekIn(weekOf, zone);
  const range = { from, now: ctx.now, to: addDaysIn(from, 7, zone) };
  const categories = timeByCategory(state, range);
  const zoned = { ...range, zone };
  const hours = productiveHours(state.time, zoned);
  return {
    byCategory: withShares(
      categories.map((row) => ({
        color: CATEGORY_COLORS[row.category],
        key: row.category satisfies ActivityCategory,
        minutes: row.minutes,
        name: null,
      })),
    ),
    byProject: withShares(
      timeByProject(state, range).map((row) => ({
        ...projectLabel(state, row.projectId),
        key: row.projectId,
        minutes: row.minutes,
      })),
    ),
    estimates: estimateVsTracked(state, range),
    focusSleep: withDayShares(focusVsSleep(state.time, zoned)),
    fragmentation: fragmentation(state.time, zoned),
    hours: { minutes: hours, peak: peakOf(hours) },
    next: from >= thisWeek ? null : addDaysIn(from, 7, zone),
    onTime: onTimeByProject(state, range).map((row) => ({
      ...row,
      ...projectLabel(state, row.projectId),
    })),
    previous: addDaysIn(from, -7, zone),
    totalMinutes: categories.reduce((sum, row) => sum + row.minutes, 0),
    weekStart: from,
  };
};
