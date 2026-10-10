import type { CoreState } from "../materialize/core-state.ts";
import type { Importance, ResolvedPreset } from "../model/preset.ts";
import type { Result } from "../result.ts";

import { isOpen, type Task } from "../model/task.ts";
import { type PresetError, taskPreset } from "../presets/resolve-preset.ts";

/** Predicates the queries share: what kind of task this is, as the screens see it. */

/**
A recurring instance nobody filled in yet: no problems, no source, no progress, never
touched. It is on Now (the week's plan) but nothing to review or remind about yet.
*/
export const isEmptyInstance = (task: Task): boolean =>
  task.id.startsWith("hw:") &&
  task.subtasks.length === 0 &&
  task.sourceText === null &&
  task.slider === null &&
  !task.touched;

/** Captured but unsorted: the inbox is its own list, with a counter on Now. */
export const isInboxTask = (task: Task): boolean => task.presetId === "inbox";

/** Open tasks with something in them: not an untouched instance, not an inbox item. */
export const isActiveTask = (task: Task): boolean =>
  isOpen(task) && !isEmptyInstance(task) && !isInboxTask(task);

export const importanceOf = (task: Task, preset: ResolvedPreset): Importance =>
  task.importance ?? preset.defaultImportance;

/** The task's preset chain with its own overrides on top, shaped by its subtasks. */
export const presetOf = (state: CoreState, task: Task): Result<ResolvedPreset, PresetError> =>
  taskPreset(state.presets, task);
