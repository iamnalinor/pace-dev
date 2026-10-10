import {
  type CloseOutcome,
  err,
  type EventInput,
  type Importance,
  resolvePreset,
  type TaskStatus,
  unsubmittedSubtasks,
} from "@pace/core";

import {
  type ActionDeps,
  type ActionResult,
  emit,
  fromStore,
  presetOf,
  serially,
  stamp,
  taskOf,
  type When,
} from "./deps.ts";
import { type SubtaskForm, subtaskInputs } from "./task-actions.ts";

export type SubmitInput = When & {
  readonly taskId: string;
  /** Per-problem tasks: which problems to send; default = every solved, unsent one. */
  readonly subtaskIds?: readonly string[] | undefined;
};

export type CloseInput = When & {
  readonly taskId: string;
  readonly outcome: Exclude<CloseOutcome, "cancelled_missed">;
  readonly reason?: string | undefined;
};

export type WorkActions = {
  readonly markSolved: (taskId: string, subtaskId: string, when?: When) => ActionResult;
  /** Revokes the latest solve of the problem. */
  readonly unmarkSolved: (taskId: string, subtaskId: string) => ActionResult;
  readonly addSubtasks: (taskId: string, items: readonly (string | SubtaskForm)[]) => ActionResult;
  /** Takes an unsent problem off the task (History brings it back). */
  readonly removeSubtask: (taskId: string, subtaskId: string) => ActionResult;
  /** Per problem: sends the given (or every solved) problem, closing with the last one; whole: closes as done. */
  readonly submit: (input: SubmitInput) => ActionResult;
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

const unmarkSolved =
  (deps: ActionDeps): WorkActions["unmarkSolved"] =>
  async (taskId, subtaskId) => {
    // Effective events are in canonical order, so the last match is the latest solve.
    const latest = deps.state.store
      .getState()
      .events.findLast(
        (event) =>
          event.type === "task.subtask.solved" &&
          event.payload.taskId === taskId &&
          event.payload.subtaskId === subtaskId,
      );
    return latest === undefined
      ? err("action/nothing-to-do")
      : fromStore(await deps.state.revoke(latest.id));
  };

/** Which problems a submission sends and whether that is the last of them. */
const submission = (
  deps: ActionDeps,
  input: SubmitInput,
):
  | { readonly ok: false; readonly error: ActionErrorOf }
  | { readonly ok: true; readonly value: EventInput } => {
  const task = taskOf(deps, input.taskId);
  if (!task.ok) {
    return task;
  }
  const preset = presetOf(deps, task.value);
  if (!preset.ok) {
    return preset;
  }
  if (preset.value.submission === "whole") {
    return {
      ok: true,
      value: stamp(
        deps,
        { type: "task.submitted", payload: { taskId: input.taskId, closes: true } },
        input,
      ),
    };
  }
  const subtaskIds =
    input.subtaskIds ??
    task.value.subtasks
      .filter((item) => item.solvedAt !== null && item.submittedAt === null)
      .map((item) => item.id);
  if (subtaskIds.length === 0) {
    return err("action/nothing-to-do");
  }
  const isLast = unsubmittedSubtasks(task.value).every((item) => subtaskIds.includes(item.id));
  return {
    ok: true,
    value: stamp(
      deps,
      {
        type: "task.submitted",
        payload: {
          taskId: input.taskId,
          subtaskIds: [...subtaskIds],
          ...(isLast && { closes: true }),
        },
      },
      input,
    ),
  };
};

type ActionErrorOf = Extract<Awaited<ActionResult>, { readonly ok: false }>["error"];

const submit =
  (deps: ActionDeps): WorkActions["submit"] =>
  async (input) =>
    await serially(deps, async () => {
      const prepared = submission(deps, input);
      return prepared.ok ? await emit(deps, [prepared.value]) : prepared;
    });

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
      return await emit(deps, [
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
    return task.value.closed === null
      ? err("action/nothing-to-do")
      : await emit(deps, [stamp(deps, { type: "task.reopened", payload: { taskId } })]);
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
  markSolved: async (taskId, subtaskId, when) =>
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
  submit: submit(deps),
  unmarkSolved: unmarkSolved(deps),
});
