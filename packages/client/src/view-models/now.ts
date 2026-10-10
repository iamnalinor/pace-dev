import {
  type CoreState,
  hasLaterStart,
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
  /** How long an undated task has been open. */
  | { readonly kind: "age"; readonly minutes: number }
  /** Paused by the person: shown so a paused task does not look like the others. */
  | {
      readonly kind: "due";
      readonly at: string;
      readonly tz: string;
      readonly relative: DueRelative;
      /** The due was set in a zone whose offset differs from the device's: show both times. */
      readonly zoneDiffers: boolean;
    }
  | { readonly kind: "importance"; readonly importance: Importance }
  | { readonly kind: "late"; readonly minutes: number; readonly isSoft: boolean }
  /** `isSoft`: a resubmission deadline, whose lateness is never told in minutes. */
  | { readonly kind: "left"; readonly minutes: number }
  /** Time until the due, shown next to it: "6d 12h left". */
  | { readonly kind: "paused" }
  | { readonly kind: "problems-left"; readonly count: number }
  | { readonly kind: "sent"; readonly submitted: number }
  | { readonly kind: "solved"; readonly solved: number; readonly total: number }
  /** A start still ahead: the row waits under "In future". */
  | { readonly kind: "starts"; readonly at: string; readonly tz: string };

export type RowTag =
  | { readonly kind: "preset"; readonly presetId: string; readonly name: string }
  | { readonly kind: "project"; readonly name: string };

export type NowRow = {
  readonly id: string;
  readonly title: string;
  readonly projectId: null | string;
  /** The project's color, else the preset's. */
  readonly color: ProjectColorName;
  /** What the color stands for, shown as a colored tag: the project, else the category. */
  readonly tag: RowTag;
  readonly importance: Importance;
  /** 0..1 in the preset's progress mode. */
  readonly progress: number;
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
  /** Open tasks by deadline, the nearest first. */
  readonly rows: readonly NowRow[];
  /** Tasks that start later, folded under "In future". */
  readonly future: readonly NowRow[];
  readonly inboxCount: number;
  /** Projects with open tasks, by name. */
  readonly projects: readonly ProjectChip[];
};

/** Every row names its importance, Normal included: it reads right after the project. */
const importancePart = (item: NowItem): readonly MetaPart[] => [
  { kind: "importance", importance: item.importance },
];

const startsPart = (item: NowItem, ctx: QueryContext): readonly MetaPart[] =>
  item.task.startAt !== null && hasLaterStart(item.task, ctx.now)
    ? [{ kind: "starts", at: item.task.startAt, tz: item.task.startTz ?? ctx.deviceTz }]
    : [];

/** Lateness, else the due date and, while the task is open, the time left to it. */
const duePart = (item: NowItem, ctx: QueryContext): readonly MetaPart[] => {
  const { task } = item;
  if (item.lateMinutes !== null) {
    const isSoft = item.preset.deadlinePolicy.kind === "resubmission";
    return [{ isSoft, kind: "late", minutes: item.lateMinutes }];
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
      ...(task.closed === null
        ? [{ kind: "left" as const, minutes: Math.max(0, minutesBetween(ctx.now, task.dueAt)) }]
        : []),
    ];
  }
  return [];
};

/** Problems solved and sent; a late sheet shows what is still owed. */
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
  return [];
};

/** How old an undated open task is; not next to a later start (that says when it begins). */
const agePart = (item: NowItem, ctx: QueryContext): readonly MetaPart[] =>
  item.dueAt === null && item.task.closed === null && !hasLaterStart(item.task, ctx.now)
    ? [{ kind: "age", minutes: Math.max(0, minutesBetween(item.task.createdAt, ctx.now)) }]
    : [];

const pausedPart = (item: NowItem): readonly MetaPart[] =>
  item.task.status === "paused" && item.task.closed === null ? [{ kind: "paused" }] : [];

/** A row of the Now list or of a project's lists (closed tasks too). */
export const nowRow = (item: NowItem, ctx: QueryContext): NowRow => ({
  id: item.task.id,
  title: item.task.title,
  projectId: item.task.projectId,
  color: item.project?.color ?? item.preset.color,
  tag:
    item.project === null
      ? { kind: "preset", name: item.presetName, presetId: item.task.presetId }
      : { kind: "project", name: item.project.name },
  importance: item.importance,
  progress: item.progress,
  dimmed: item.importance === "nice_to_have" && item.task.dueAt === null,
  meta: [
    ...importancePart(item),
    ...pausedPart(item),
    ...startsPart(item, ctx),
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
    future: list.future.map((item) => nowRow(item, ctx)),
    inboxCount: list.inboxCount,
    projects: projectChips(state),
  };
};
