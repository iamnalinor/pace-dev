import type { z } from "zod";

import type { Event } from "../events/event-schema.ts";
import type { CloseOutcomeSchema, TaskStatusSchema } from "../events/payloads.ts";
import type { Importance, ProgressMode } from "./preset.ts";

export type TaskStatus = z.output<typeof TaskStatusSchema>;

export type CloseOutcome = z.output<typeof CloseOutcomeSchema>;

/** Solved and submitted are independent marks: a solved problem is not sent until `submittedAt`. */
export type Subtask = {
  readonly id: string;
  readonly label: string;
  /** Problem number for homework; `null` for free-form items. */
  readonly number: null | number;
  readonly solvedAt: null | string;
  readonly submittedAt: null | string;
};

/** How and when a task was closed; `eventId` lets the review block undo an automatic outcome. */
export type Closure = {
  readonly outcome: CloseOutcome;
  readonly at: string;
  readonly reason: null | string;
  readonly source: Event["source"];
  readonly eventId: string;
};

export type TaskSource = {
  readonly text: string;
  readonly url: null | string;
  readonly at: string;
};

export type TaskFields = {
  readonly ticket: null | string;
  readonly submitVia: null | string;
};

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly presetId: string;
  readonly projectId: null | string;
  /** `null` means "use the preset default". */
  readonly importance: Importance | null;
  readonly importanceSetAt: null | string;
  readonly dueAt: null | string;
  readonly dueTz: null | string;
  readonly startAt: null | string;
  readonly startTz: null | string;
  readonly estimateMinutes: null | number;
  readonly subtasks: readonly Subtask[];
  /** Progress slider 0..10; `null` when never moved. */
  readonly slider: null | number;
  readonly description: null | string;
  /** The text the task was parsed from (the first attached source). */
  readonly sourceText: null | string;
  readonly sources: readonly TaskSource[];
  readonly fields: TaskFields;
  /** Per-task preset overrides, validated by the preset module. */
  readonly overrides: null | Readonly<Record<string, unknown>>;
  readonly status: TaskStatus;
  readonly statusSince: string;
  /** Waiting time of the finished spells; the running spell is added when it ends. */
  readonly waitingMinutes: number;
  /** True once the user did anything that implies work; survives the close for analytics. */
  readonly touched: boolean;
  /** Manual position inside the importance category. */
  readonly rank: null | number;
  readonly createdAt: string;
  /** Whole-task submission; per-subtask submissions live on the subtasks. */
  readonly submittedAt: null | string;
  readonly closed: Closure | null;
  readonly reopenedAt: null | string;
  readonly lastEventAt: string;
};

export type TasksState = { readonly byId: Readonly<Record<string, Task>> };

export const INITIAL_TASKS_STATE: TasksState = { byId: {} };

/** Own-property lookup: a task id must never resolve to something on `Object.prototype`. */
export const taskById = (state: TasksState, id: string): Task | undefined =>
  Object.hasOwn(state.byId, id) ? state.byId[id] : undefined;

export const isOpen = (task: Task): boolean => task.closed === null;

export const solvedCount = (task: Task): number =>
  task.subtasks.filter((item) => item.solvedAt !== null).length;

export const submittedCount = (task: Task): number =>
  task.subtasks.filter((item) => item.submittedAt !== null).length;

export const unsubmittedSubtasks = (task: Task): readonly Subtask[] =>
  task.subtasks.filter((item) => item.submittedAt === null);

const SLIDER_MAX = 10;

const sliderProgress = (task: Task): number => (task.slider ?? 0) / SLIDER_MAX;

/**
 * Progress in `[0, 1]`. A task without subtasks but with a slider value follows the slider
 * whatever the mode: that is the only progress the user ever gave it.
 */
export const progressOf = (task: Task, progressMode: ProgressMode): number => {
  if (task.subtasks.length === 0 && task.slider !== null) {
    return sliderProgress(task);
  }
  switch (progressMode) {
    case "subtasks": {
      return task.subtasks.length === 0 ? 0 : solvedCount(task) / task.subtasks.length;
    }
    case "slider": {
      return sliderProgress(task);
    }
    case "none": {
      return 0;
    }
  }
};
