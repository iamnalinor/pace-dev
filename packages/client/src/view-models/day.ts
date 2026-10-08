import {
  accountTz,
  type ActivityCategory,
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
  readonly taskTitle: null | string;
  /** The activity's Expect, when it has one. */
  readonly expectMinutes: null | number;
  /** The activity's Limit, when it has one. */
  readonly limitMinutes: null | number;
  /** `false` when the label only repeats the category ("Food" in Food): the tag says it. */
  readonly showsLabel: boolean;
  /** Messaging was part of it: no phone penalty. */
  readonly messengersOnPurpose: boolean;
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
  row: Pick<DayRow, "activityId" | "category" | "endAt" | "isRunning" | "label" | "startAt">,
): ActivityTarget => ({
  activityId: row.activityId,
  category: row.category,
  endAt: row.isRunning ? null : row.endAt,
  kind: "edit",
  label: row.label,
  startAt: row.startAt,
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
  const rows: readonly DayEntry[] = day.segments.map((segment) => ({
    key: `${segment.activityId}-${segment.startAt}`,
    kind: "activity",
    target: editTargetOf(segment),
    row: {
      ...segment,
      color: CATEGORY_COLORS[segment.category],
      limitMinutes: state.time.activities[segment.activityId]?.limitMinutes ?? null,
      showsLabel: !isCategoryName(segment.label, segment.category),
      taskTitle:
        segment.taskId === null ? null : (taskById(state.tasks, segment.taskId)?.title ?? null),
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
