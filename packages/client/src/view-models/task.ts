import {
  type Closure,
  type CoreState,
  extractLink,
  type Importance,
  linkHost,
  type Outcome,
  presetById,
  type PresetError,
  type ProgressMode,
  progressOf,
  type ProjectColorName,
  type QueryContext,
  type Result,
  type Submission,
  type SubmitPreview,
  type Task,
  taskOutcome,
  type TaskStatus,
  type TaskView,
  taskView,
} from "@pace/core";

import { type QuickTime, quickTimes } from "../clock.ts";

export type TaskTag =
  | { readonly kind: "importance"; readonly importance: Importance }
  | { readonly kind: "outcome"; readonly outcome: Outcome }
  | { readonly kind: "status"; readonly status: TaskStatus }
  | { readonly kind: "submission"; readonly submission: Submission };

export type ProblemState = "pending" | "solved" | "submitted";

export type ProblemRow = {
  readonly id: string;
  readonly number: null | number;
  readonly label: string;
  readonly state: ProblemState;
  readonly solvedAt: null | string;
  readonly submittedAt: null | string;
};

export type PrimaryAction =
  | { readonly kind: "done" }
  | { readonly kind: "none" }
  | { readonly kind: "submit"; readonly subtaskIds: readonly string[] };

/** What the override sheet edits: the effective values and whether the task set them itself. */
export type OverrideSheet = {
  readonly presetId: string;
  readonly presetName: string;
  readonly presets: readonly {
    readonly id: string;
    readonly name: string;
    readonly builtIn: boolean;
  }[];
  readonly importance: Importance;
  readonly isImportanceOwn: boolean;
  readonly dueAt: null | string;
  readonly dueTz: null | string;
  readonly estimateMinutes: number;
  readonly isEstimateOwn: boolean;
  readonly overrides: null | Readonly<Record<string, unknown>>;
};

export type TaskLink = { readonly url: string; readonly host: string };

const taskLink = (
  explicit: null | string,
  sourceText: null | string,
  description: null | string,
): null | TaskLink => {
  const url = explicit ?? extractLink(sourceText) ?? extractLink(description);
  return url === null ? null : { host: linkHost(url), url };
};

export type TaskViewModel = {
  readonly id: string;
  readonly title: string;
  readonly description: null | string;
  /**
  The task's link: set explicitly, else the first web address in the source text or the
  description. `host` is what the chip shows until the page title is known.
  */
  readonly link: null | TaskLink;
  readonly submitVia: null | string;
  readonly sourceText: null | string;
  readonly project: null | {
    readonly id: string;
    readonly name: string;
    readonly color: null | ProjectColorName;
  };
  readonly tags: readonly TaskTag[];
  readonly stats: {
    readonly dueAt: null | string;
    readonly dueTz: null | string;
    readonly dueZoneDiffers: boolean;
    /** When the task starts: its own start, else its creation. */
    readonly startAt: string;
    readonly startTz: null | string;
    readonly workLeftMinutes: number;
    readonly trackedMinutes: number;
    readonly estimateMinutes: number;
  };
  readonly progress: {
    readonly mode: ProgressMode;
    readonly value: number;
    readonly slider: null | number;
  };
  readonly problems: readonly ProblemRow[];
  readonly primaryAction: PrimaryAction;
  readonly quickTimes: readonly QuickTime[];
  readonly overrideSheet: OverrideSheet;
  readonly closed: Closure | null;
  readonly outcome: null | Outcome;
};

const problemState = (solvedAt: null | string, submittedAt: null | string): ProblemState => {
  if (submittedAt !== null) {
    return "submitted";
  }
  return solvedAt === null ? "pending" : "solved";
};

const tags = (view: TaskView, outcome: null | Outcome): readonly TaskTag[] => [
  { kind: "importance", importance: view.importance },
  // A closed task shows how it ended, not the status it had while open.
  outcome === null ? { kind: "status", status: view.status } : { kind: "outcome", outcome },
  // Only a task with subtasks can be submitted piece by piece; "whole" goes without saying.
  ...(view.preset.submission === "per_subtask"
    ? [{ kind: "submission" as const, submission: view.preset.submission }]
    : []),
];

const primaryAction = (preview: SubmitPreview): PrimaryAction => {
  if (preview.kind === "per_subtask") {
    return preview.subtaskIds.length === 0
      ? { kind: "none" }
      : { kind: "submit", subtaskIds: preview.subtaskIds };
  }
  return { kind: preview.canClose ? "done" : "none" };
};

const overrideSheet = (state: CoreState, view: TaskView): OverrideSheet => {
  const { task, preset } = view;
  return {
    presetId: task.presetId,
    presetName: presetById(state.presets, task.presetId)?.name ?? task.presetId,
    presets: Object.values(state.presets.byId)
      .filter((candidate) => !candidate.archived)
      .map(({ id, name, builtIn }) => ({ id, name, builtIn })),
    importance: view.importance,
    isImportanceOwn: task.importance !== null,
    dueAt: task.dueAt,
    dueTz: task.dueTz,
    estimateMinutes: task.estimateMinutes ?? preset.defaultEstimateMinutes,
    isEstimateOwn: task.estimateMinutes !== null,
    overrides: task.overrides,
  };
};

const stats = (view: TaskView): TaskViewModel["stats"] => ({
  dueAt: view.task.dueAt,
  dueTz: view.task.dueTz,
  dueZoneDiffers: view.dueZoneDiffers,
  startAt: view.task.startAt ?? view.task.createdAt,
  startTz: view.task.startTz,
  workLeftMinutes: view.task.closed === null ? view.workLeftMinutes : 0,
  trackedMinutes: view.trackedMinutes,
  estimateMinutes: view.task.estimateMinutes ?? view.preset.defaultEstimateMinutes,
});

const problems = (task: Task): readonly ProblemRow[] =>
  task.subtasks.map((item) => ({
    id: item.id,
    number: item.number,
    label: item.label,
    state: problemState(item.solvedAt, item.submittedAt),
    solvedAt: item.solvedAt,
    submittedAt: item.submittedAt,
  }));

export const taskViewModel = (
  state: CoreState,
  taskId: string,
  ctx: QueryContext,
): Result<TaskViewModel, "task/unknown" | PresetError> => {
  const result = taskView(state, taskId, ctx);
  if (!result.ok) {
    return result;
  }
  const view = result.value;
  const { task, preset, project } = view;
  return {
    ok: true,
    value: {
      id: task.id,
      title: task.title,
      description: task.description,
      link: taskLink(task.fields.link, task.sourceText, task.description),
      submitVia: task.fields.submitVia,
      sourceText: task.sourceText,
      project:
        project === null ? null : { id: project.id, name: project.name, color: project.color },
      tags: tags(view, taskOutcome(task, preset)),
      stats: stats(view),
      progress: {
        mode: preset.progressMode,
        value: progressOf(task, preset.progressMode),
        slider: task.slider,
      },
      problems: problems(task),
      primaryAction: primaryAction(view.submitPreview),
      quickTimes: quickTimes({ deviceTz: ctx.deviceTz, now: () => ctx.now }, task),
      overrideSheet: overrideSheet(state, view),
      closed: task.closed,
      outcome: taskOutcome(task, preset),
    },
  };
};
