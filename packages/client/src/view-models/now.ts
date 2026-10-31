import {
  type CoreState,
  finalDeadlineOf,
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
  /** The hard end of a two-stage deadline, once the main due date is behind and it is not. */
  | { readonly kind: "final"; readonly at: string; readonly tz: string }
  | { readonly kind: "importance"; readonly importance: Importance }
  | { readonly kind: "late"; readonly minutes: number; readonly isSoft: boolean }
  /** `isSoft`: a resubmission deadline, whose lateness is never told in minutes. */
  | { readonly kind: "left"; readonly minutes: number }
  /** Time until the due, shown next to it: "6d 12h left". */
  | { readonly kind: "paused" }
  /** An instance of a repeating series or a weekly homework: the row carries a repeat mark. */
  | { readonly kind: "repeats" }
  | { readonly kind: "sent"; readonly submitted: number }
  | { readonly kind: "solved"; readonly solved: number; readonly total: number }
  | { readonly kind: "starts"; readonly at: string; readonly tz: string }
  /** A start still ahead: the row waits under "In future". */
  | { readonly kind: "subtasks-left"; readonly count: number };

export type RowTag =
  | { readonly kind: "preset"; readonly presetId: string; readonly name: string }
  | { readonly kind: "project"; readonly name: string };

export type NowRow = {
  readonly id: string;
  readonly title: string;
  readonly dueAt: null | string;
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
  /** Projects with open tasks, by name; empty when filtering by them would change nothing. */
  readonly projects: readonly ProjectChip[];
};

/** Every row names its importance, Normal included: it reads right after the project. */
const importancePart = (item: NowItem): readonly MetaPart[] => [
  { kind: "importance", importance: item.importance },
];

const repeatsPart = (item: NowItem): readonly MetaPart[] =>
  item.repeat === null ? [] : [{ kind: "repeats" }];

const startsPart = (item: NowItem, ctx: QueryContext): readonly MetaPart[] =>
  item.task.startAt !== null && hasLaterStart(item.task, ctx.now)
    ? [{ kind: "starts", at: item.task.startAt, tz: item.task.startTz ?? ctx.deviceTz }]
    : [];

/** Lateness, else the due date and, while the task is open, the time left to it. */
const duePart = (item: NowItem, ctx: QueryContext): readonly MetaPart[] => {
  const { task } = item;
  if (item.lateMinutes !== null) {
    const isSoft = item.preset.deadlinePolicy.kind === "resubmission";
    const final = finalDeadlineOf(task, item.preset);
    return [
      { isSoft, kind: "late", minutes: item.lateMinutes },
      ...(final !== null && task.closed === null && Date.parse(final.at) > Date.parse(ctx.now)
        ? [{ kind: "final" as const, ...final }]
        : []),
    ];
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

/** Subtasks solved and sent; a late sheet shows what is still owed. */
const progressParts = (item: NowItem): readonly MetaPart[] => {
  if (item.total > 0) {
    if (item.isLate) {
      return [{ kind: "subtasks-left", count: item.total - item.submitted }];
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
  dueAt: item.dueAt,
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
    ...repeatsPart(item),
    ...pausedPart(item),
    ...startsPart(item, ctx),
    ...duePart(item, ctx),
    ...progressParts(item),
    ...agePart(item, ctx),
  ],
});

const IMPORTANCE_ORDER: Readonly<Record<Importance, number>> = {
  asap: 0,
  prioritized: 1,
  normal: 2,
  nice_to_have: 3,
};

/** Dated tasks stay in deadline order; undated ones put urgency first, keeping ties stable. */
export const groupNowRows = (
  rows: readonly NowRow[],
): { readonly dated: readonly NowRow[]; readonly undated: readonly NowRow[] } => ({
  dated: rows.filter((row) => row.dueAt !== null),
  undated: rows
    .filter((row) => row.dueAt === null)
    .toSorted((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance]),
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

const allChips = (state: CoreState): readonly ProjectChip[] =>
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

/** Open tasks outside the Inbox: what the filter divides. */
const openTotal = (state: CoreState): number =>
  Object.values(state.tasks.byId).filter((task) => isOpen(task) && task.presetId !== "inbox")
    .length;

/**
One chip per project with open tasks, by name; none when a filter could not narrow the list
(no project, or one project holding every open task), so no "All" stands there alone.
*/
const projectChips = (state: CoreState): readonly ProjectChip[] => {
  const chips = allChips(state);
  const [only] = chips;
  return chips.length === 0 || (chips.length === 1 && only?.open === openTotal(state)) ? [] : chips;
};

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
