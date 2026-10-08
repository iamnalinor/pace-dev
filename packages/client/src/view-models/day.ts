import {
  accountTz,
  addDaysIn,
  type ActivityCategory,
  CATEGORY_COLORS,
  type CoreState,
  type Gap,
  type ProjectColorName,
  type QueryContext,
  startOfDayIn,
  taskById,
  timeline,
} from "@pace/core";

export type DayRow = {
  readonly activityId: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
  readonly startAt: string;
  readonly endAt: string;
  readonly minutes: number;
  readonly isRunning: boolean;
  readonly isLogged: boolean;
  readonly taskId: null | string;
  readonly taskTitle: null | string;
};

export type DayEntry =
  | { readonly kind: "activity"; readonly row: DayRow }
  | { readonly kind: "gap"; readonly gap: Gap };

export type DayTotal = {
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
  readonly minutes: number;
};

export type DayModel = {
  /** Midnight of the day in the account zone. */
  readonly date: string;
  readonly zone: string;
  readonly isToday: boolean;
  readonly previous: string;
  /** `null` for today: the future has nothing to show. */
  readonly next: null | string;
  readonly entries: readonly DayEntry[];
  readonly totals: readonly DayTotal[];
  readonly trackedMinutes: number;
};

/** One day of the ledger in the account zone: activities and the gaps between them, in order. */
export const dayModel = (
  state: CoreState,
  date: null | string,
  ctx: QueryContext,
): DayModel => {
  const zone = accountTz(state, ctx);
  const today = startOfDayIn(ctx.now, zone);
  const from = date === null ? today : startOfDayIn(date, zone);
  const to = addDaysIn(from, 1, zone);
  const day = timeline(state.time, { from, now: ctx.now, to });
  const rows: readonly DayEntry[] = day.segments.map((segment) => ({
    kind: "activity",
    row: {
      ...segment,
      color: CATEGORY_COLORS[segment.category],
      taskTitle: segment.taskId === null ? null : (taskById(state.tasks, segment.taskId)?.title ?? null),
    },
  }));
  const gaps: readonly DayEntry[] = day.gaps.map((gap) => ({ gap, kind: "gap" }));
  const startOf = (entry: DayEntry): string => (entry.kind === "gap" ? entry.gap.startAt : entry.row.startAt);
  return {
    date: from,
    entries: [...rows, ...gaps].toSorted((a, b) => Date.parse(startOf(a)) - Date.parse(startOf(b))),
    isToday: from === today,
    next: from >= today ? null : addDaysIn(from, 1, zone),
    previous: addDaysIn(from, -1, zone),
    totals: Object.entries(day.totals)
      .map(([category, minutes]) => ({
        category: category as ActivityCategory,
        color: CATEGORY_COLORS[category as ActivityCategory],
        minutes,
      }))
      .toSorted((a, b) => b.minutes - a.minutes),
    trackedMinutes: day.trackedMinutes,
    zone,
  };
};
