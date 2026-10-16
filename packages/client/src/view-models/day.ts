import {
  accountTz,
  type ActivityCategory,
  activityLabel,
  addDaysIn,
  addMinutesIso,
  CATEGORY_COLORS,
  type CoreState,
  formatInZone,
  type Gap,
  LANGUAGES,
  type ProjectColorName,
  type QueryContext,
  startOfDayIn,
  t,
  taskById,
  timeline,
} from "@pace/core";

import type { ActivityTarget } from "../actions/time-actions.ts";

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
  /**
  Where the block's task opens: "Open task" when the label already is the task's title (Focus
  names it so), else the task's title; `null` without a task, or with one removed since.
  */
  readonly taskLink: null | TaskLink;
  /** The activity's Expect, when it has one. */
  readonly expectMinutes: null | number;
  /** `false` when the label only repeats the category ("Food" in Food): the tag says it. */
  readonly showsLabel: boolean;
  /** Ran next to the main line: shown, not counted in the day's totals. */
  readonly isAlongside: boolean;
};

/** The link to a block's task: its words, a message to translate or the task's own title. */
export type TaskLink = {
  readonly id: string;
  readonly text: { readonly key: "day.openTask" } | { readonly title: string };
};

/** The block's link to its task, worded so it never repeats the label above it. */
const taskLinkOf = (
  state: Pick<CoreState, "tasks">,
  segment: { readonly label: string; readonly taskId: null | string },
): null | TaskLink => {
  const task = segment.taskId === null ? undefined : taskById(state.tasks, segment.taskId);
  if (task === undefined) {
    return null;
  }
  // The label is the title as an activity stores it: cut to its limit.
  const isTitle = segment.label === activityLabel(task.title);
  return { id: task.id, text: isTitle ? { key: "day.openTask" } : { title: task.title } };
};

/** A line of the day: an activity or a gap, with its list key and what tapping it opens. */
export type DayEntry = { readonly key: string; readonly target: ActivityTarget } & (
  | { readonly kind: "activity"; readonly row: DayRow }
  | { readonly kind: "gap"; readonly gap: Gap }
);

/** A label that is just the category's name, in any interface language. */
const isCategoryName = (label: string, category: ActivityCategory): boolean => {
  const key = label.trim().toLowerCase();
  return (
    key === category ||
    LANGUAGES.some((language) => t(language, `category.${category}`).toLowerCase() === key)
  );
};

/** The days (`YYYY-MM-DD` on the account's calendar) that have tracked time: the calendar's dots. */
export const trackedDates = (state: CoreState, ctx: QueryContext): ReadonlySet<string> => {
  const zone = accountTz(state, ctx);
  return new Set(
    Object.values(state.time.activities).map((activity) =>
      formatInZone(activity.startAt, zone, "yyyy-MM-dd"),
    ),
  );
};

const editTargetOf = (
  row: Pick<
    DayRow,
    | "activityId"
    | "category"
    | "endAt"
    | "expectMinutes"
    | "isRunning"
    | "label"
    | "startAt"
    | "taskId"
  >,
): ActivityTarget => ({
  activityId: row.activityId,
  category: row.category,
  endAt: row.isRunning ? null : row.endAt,
  expectMinutes: row.expectMinutes,
  kind: "edit",
  label: row.label,
  startAt: row.startAt,
  taskId: row.taskId,
});

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
  /** "Log past activity": the last half hour of the day, or of today so far. */
  readonly logTarget: ActivityTarget;
};

/** How long a block "Log past activity" proposes. */
const LOG_MINUTES = 30;

/** One day of the ledger in the account zone: activities and the gaps between them, in order. */
export const dayModel = (state: CoreState, date: null | string, ctx: QueryContext): DayModel => {
  const zone = accountTz(state, ctx);
  const today = startOfDayIn(ctx.now, zone);
  const from = date === null ? today : startOfDayIn(date, zone);
  const to = addDaysIn(from, 1, zone);
  const day = timeline(state.time, { from, now: ctx.now, to });
  const rows: readonly DayEntry[] = [...day.segments, ...day.alongside].map((segment) => ({
    key: `${segment.activityId}-${segment.startAt}`,
    kind: "activity",
    target: editTargetOf(segment),
    row: {
      ...segment,
      color: CATEGORY_COLORS[segment.category],
      showsLabel: !isCategoryName(segment.label, segment.category),
      taskLink: taskLinkOf(state, segment),
    },
  }));
  // A day with nothing on it is empty, not one gap from midnight to now.
  const gaps: readonly DayEntry[] =
    rows.length === 0
      ? []
      : day.gaps.map((gap) => ({
          gap,
          key: `gap-${gap.startAt}`,
          kind: "gap",
          target: { endAt: gap.endAt, kind: "log", startAt: gap.startAt },
        }));
  const startOf = (entry: DayEntry): string =>
    entry.kind === "gap" ? entry.gap.startAt : entry.row.startAt;
  const until = Date.parse(to) > Date.parse(ctx.now) ? ctx.now : to;
  return {
    date: from,
    logTarget: { endAt: until, kind: "log", startAt: addMinutesIso(until, -LOG_MINUTES) },
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
