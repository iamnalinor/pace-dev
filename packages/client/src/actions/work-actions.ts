import {
  type CloseOutcome,
  err,
  type EventInput,
  type Importance,
  resolvePreset,
  taskById,
  type TaskStatus,
} from "@pace/core";

import {
  type ActionDeps,
  type ActionResult,
  emit,
  serially,
  stageEmit,
  stamp,
  taskOf,
  type When,
} from "./deps.ts";
import { type SubtaskForm, subtaskInputs } from "./task-actions.ts";

export type CloseInput = When & {
  readonly taskId: string;
  readonly outcome: Exclude<CloseOutcome, "cancelled_missed">;
  readonly reason?: string | undefined;
};

export type WorkActions = {
  /** Marks a subtask done at `when` (now by default): the one mark a subtask has (feedback 5). */
  readonly markDone: (taskId: string, subtaskId: string, when?: When) => ActionResult;
  /** Revokes the subtask's done marks; refused (`retro/task-closed`) while the task is closed. */
  readonly unmarkDone: (taskId: string, subtaskId: string) => ActionResult;
  readonly addSubtasks: (taskId: string, items: readonly (string | SubtaskForm)[]) => ActionResult;
  /** Takes a subtask off the task (History brings it back). */
  readonly removeSubtask: (taskId: string, subtaskId: string) => ActionResult;
  readonly closeTask: (input: CloseInput) => ActionResult;
  readonly reopen: (taskId: string) => ActionResult;
  readonly setStatus: (taskId: string, status: TaskStatus) => ActionResult;
  readonly setImportance: (taskId: string, importance: Importance) => ActionResult;
  /** The progress slider, 0..10. */
  readonly setProgress: (taskId: string, slider: number) => ActionResult;
  readonly setEstimate: (taskId: string, minutes: null | number) => ActionResult;
  readonly setPreset: (taskId: string, presetId: string) => ActionResult;
  readonly setOverrides: (
    taskId: string,
    overrides: Readonly<Record<string, unknown>>,
  ) => ActionResult;
};

const SLIDER_MAX = 10;

/**
The corrections that take a subtask's done mark back: every effective `task.subtask.solved` of it
revoked, and every old per-subtask `task.submitted` that names it amended to leave it out (or
revoked when it named only this one), since either mark reads as done (feedback 5).
*/
const undoneBy = (deps: ActionDeps, taskId: string, subtaskId: string): readonly EventInput[] =>
  deps.state.store.getState().events.flatMap((event): readonly EventInput[] => {
    if (event.type === "task.subtask.solved") {
      const isIt = event.payload.taskId === taskId && event.payload.subtaskId === subtaskId;
      return isIt ? [stamp(deps, { type: "event.revoked", payload: { targetId: event.id } })] : [];
    }
    if (event.type !== "task.submitted" || event.payload.taskId !== taskId) {
      return [];
    }
    const named = event.payload.subtaskIds ?? [];
    if (!named.includes(subtaskId)) {
      return [];
    }
    const rest = named.filter((id) => id !== subtaskId);
    return [
      stamp(
        deps,
        rest.length === 0
          ? { type: "event.revoked", payload: { targetId: event.id } }
          : {
              type: "event.amended",
              payload: { targetId: event.id, patch: { subtaskIds: rest } },
            },
      ),
    ];
  });

/**
A closed task's marks stay as they are, like ticking one is refused there: an old per-subtask
`task.submitted` often closed the task (`closes: true`), and revoking it would silently reopen it.
Reopen the task first.
*/
const unmarkDone =
  (deps: ActionDeps): WorkActions["unmarkDone"] =>
  async (taskId, subtaskId) => {
    const task = taskOf(deps, taskId);
    if (!task.ok) {
      return task;
    }
    if (task.value.closed !== null) {
      return err("retro/task-closed");
    }
    const corrections = undoneBy(deps, taskId, subtaskId);
    return corrections.length === 0 ? err("action/nothing-to-do") : await emit(deps, corrections);
  };

const closeTask =
  (deps: ActionDeps): WorkActions["closeTask"] =>
  async (input) =>
    await serially(deps, async () => {
      const task = taskOf(deps, input.taskId);
      if (!task.ok) {
        return task;
      }
      if (task.value.closed !== null) {
        return err("action/nothing-to-do");
      }
      const { taskId, outcome, reason } = input;
      return await stageEmit(deps, [
        stamp(
          deps,
          {
            type: "task.closed",
            payload: { taskId, outcome, ...(reason !== undefined && { reason }) },
          },
          input,
        ),
      ]);
    });

const reopen =
  (deps: ActionDeps): WorkActions["reopen"] =>
  async (taskId) => {
    const task = taskOf(deps, taskId);
    if (!task.ok) {
      return task;
    }
    // Asked again in the write queue: two presses at once write one reopen (class 222).
    const isOpen = (): boolean =>
      (taskById(deps.state.store.getState().tasks, taskId)?.closed ?? null) === null;
    return task.value.closed === null
      ? err("action/nothing-to-do")
      : await emit(deps, [stamp(deps, { type: "task.reopened", payload: { taskId } })], () =>
          isOpen() ? "action/nothing-to-do" : null,
        );
  };

const setOverrides =
  (deps: ActionDeps): WorkActions["setOverrides"] =>
  async (taskId, overrides) => {
    const task = taskOf(deps, taskId);
    if (!task.ok) {
      return task;
    }
    const resolved = resolvePreset(
      deps.state.store.getState().presets,
      task.value.presetId,
      overrides,
    );
    return resolved.ok
      ? await emit(deps, [
          stamp(deps, { type: "task.overrides.set", payload: { taskId, overrides } }),
        ])
      : resolved;
  };

export const workActions = (deps: ActionDeps): WorkActions => ({
  addSubtasks: async (taskId, items) =>
    items.length === 0
      ? err("action/nothing-to-do")
      : await emit(deps, [
          stamp(deps, {
            type: "task.subtasks.added",
            payload: { taskId, subtasks: subtaskInputs(items) },
          }),
        ]),
  closeTask: closeTask(deps),
  markDone: async (taskId, subtaskId, when) =>
    await emit(deps, [
      stamp(deps, { type: "task.subtask.solved", payload: { taskId, subtaskId } }, when),
    ]),
  removeSubtask: async (taskId, subtaskId) =>
    await emit(deps, [
      stamp(deps, { type: "task.subtask.removed", payload: { taskId, subtaskId } }),
    ]),
  reopen: reopen(deps),
  setEstimate: async (taskId, estimateMinutes) =>
    await emit(deps, [
      stamp(deps, { type: "task.estimate.set", payload: { taskId, estimateMinutes } }),
    ]),
  setImportance: async (taskId, importance) =>
    await emit(deps, [
      stamp(deps, { type: "task.importance.set", payload: { taskId, importance } }),
    ]),
  setOverrides: setOverrides(deps),
  setPreset: async (taskId, presetId) =>
    await emit(deps, [stamp(deps, { type: "task.preset.set", payload: { taskId, presetId } })]),
  setProgress: async (taskId, slider) =>
    Number.isSafeInteger(slider) && slider >= 0 && slider <= SLIDER_MAX
      ? await emit(deps, [
          stamp(deps, { type: "task.progress.set", payload: { taskId, progress: slider } }),
        ])
      : err("action/invalid-input"),
  setStatus: async (taskId, status) =>
    await emit(deps, [stamp(deps, { type: "task.status.set", payload: { taskId, status } })]),
  unmarkDone: unmarkDone(deps),
});
