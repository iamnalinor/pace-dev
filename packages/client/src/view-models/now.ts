import {
  type CoreState,
  type Importance,
  isOpen,
  minutesBetween,
  type NowItem,
  nowList,
  type NowListOptions,
  type Project,
  type ProjectColorName,
  type QueryContext,
  zonesDiffer,
} from "@pace/core";

import { type DueRelative, relativeDay } from "./relative-day.ts";

/** One piece of a row's meta line; the UI translates each kind. */
export type MetaPart =
  | { readonly kind: "age"; readonly days: number }
  | { readonly kind: "behind-pace"; readonly percent: number }
  | {
      readonly kind: "due";
      readonly at: string;
      readonly tz: string;
      readonly relative: DueRelative;
      /** The due was set in a zone whose offset differs from the device's: show both times. */
      readonly zoneDiffers: boolean;
    }
  | { readonly kind: "end-of-day" }
  | { readonly kind: "importance"; readonly importance: Importance }
  | { readonly kind: "late"; readonly minutes: number }
  | { readonly kind: "problems-left"; readonly count: number }
  | { readonly kind: "sent"; readonly submitted: number }
  | { readonly kind: "solved"; readonly solved: number; readonly total: number };

export type NowRow = {
  readonly id: string;
  readonly title: string;
  readonly projectId: null | string;
  /** The project's color, else the preset's. */
  readonly color: ProjectColorName;
  readonly importance: Importance;
  /** 0..1 in the preset's progress mode. */
  readonly progress: number;
  /** Where the pace marker sits on the bar; `null` without a due. */
  readonly paceExpected: null | number;
  /** A Nice-to-have without a deadline is shown quietly. */
  readonly dimmed: boolean;
  readonly meta: readonly MetaPart[];
};

export type ProjectChip = {
  readonly id: string;
  readonly name: string;
  readonly color: null | ProjectColorName;
  readonly open: number;
};

export type NowViewModel = {
  readonly rows: readonly NowRow[];
  readonly waiting: readonly NowRow[];
  readonly laterCount: number;
  readonly waitingCount: number;
  readonly inboxCount: number;
  /** Projects with open tasks, by name. */
  readonly projects: readonly ProjectChip[];
};

const MINUTES_PER_DAY = 24 * 60;

const importancePart = (item: NowItem): readonly MetaPart[] =>
  item.importance === "normal" ? [] : [{ kind: "importance", importance: item.importance }];

/** Lateness, else the explicit due, else the end of the day an ASAP task implies. */
const duePart = (item: NowItem, ctx: QueryContext): readonly MetaPart[] => {
  const { task } = item;
  if (item.lateMinutes !== null) {
    return [{ kind: "late", minutes: item.lateMinutes }];
  }
  if (task.dueAt !== null && task.dueTz !== null) {
    const due = { at: task.dueAt, tz: task.dueTz };
    return [
      {
        kind: "due",
        ...due,
        relative: relativeDay(task.dueAt, ctx),
        zoneDiffers: zonesDiffer(due, { at: task.dueAt, tz: ctx.deviceTz }),
      },
    ];
  }
  return item.importance === "asap" ? [{ kind: "end-of-day" }] : [];
};

const PERCENT = 100;

/** Problems solved and sent; a late sheet shows what is still owed; a slider task, its lag. */
const progressParts = (item: NowItem): readonly MetaPart[] => {
  if (item.total > 0) {
    if (item.isLate) {
      return [{ kind: "problems-left", count: item.total - item.submitted }];
    }
    return [
      { kind: "solved", solved: item.solved, total: item.total },
      ...(item.submitted > 0 ? [{ kind: "sent" as const, submitted: item.submitted }] : []),
    ];
  }
  const behind =
    item.preset.progressMode === "slider" && item.paceExpected !== null
      ? Math.round((item.paceExpected - item.progress) * PERCENT)
      : 0;
  return behind > 0 ? [{ kind: "behind-pace", percent: behind }] : [];
};

const agePart = (item: NowItem, ctx: QueryContext): readonly MetaPart[] =>
  item.dueAt === null
    ? [
        {
          kind: "age",
          days: Math.floor(minutesBetween(item.task.createdAt, ctx.now) / MINUTES_PER_DAY),
        },
      ]
    : [];

/** A row of the Now list or of a project's open list. */
export const nowRow = (item: NowItem, ctx: QueryContext): NowRow => ({
  id: item.task.id,
  title: item.task.title,
  projectId: item.task.projectId,
  color: item.project?.color ?? item.preset.color,
  importance: item.importance,
  progress: item.progress,
  paceExpected: item.paceExpected,
  dimmed: item.importance === "nice_to_have" && item.task.dueAt === null,
  meta: [
    ...importancePart(item),
    ...duePart(item, ctx),
    ...progressParts(item),
    ...agePart(item, ctx),
  ],
});

const openCount = (state: CoreState, project: Project): number =>
  Object.values(state.tasks.byId).filter(
    (task) => isOpen(task) && task.presetId !== "inbox" && task.projectId === project.id,
  ).length;

const byName = (a: ProjectChip, b: ProjectChip): number => {
  if (a.name === b.name) {
    return 0;
  }
  return a.name < b.name ? -1 : 1;
};

const projectChips = (state: CoreState): readonly ProjectChip[] =>
  Object.values(state.projects.byId)
    .filter((project) => !project.archived)
    .map((project) => ({
      id: project.id,
      name: project.name,
      color: project.color,
      open: openCount(state, project),
    }))
    .filter((chip) => chip.open > 0)
    .toSorted(byName);

export const nowViewModel = (
  state: CoreState,
  ctx: QueryContext,
  options?: NowListOptions,
): NowViewModel => {
  const list = nowList(state, ctx, options);
  return {
    rows: list.items.map((item) => nowRow(item, ctx)),
    waiting: list.waiting.map((item) => nowRow(item, ctx)),
    laterCount: list.laterCount,
    waitingCount: list.waiting.length,
    inboxCount: list.inboxCount,
    projects: projectChips(state),
  };
};
