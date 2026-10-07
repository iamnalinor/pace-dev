import {
  type Closure,
  err,
  type EventInput,
  ok,
  type Result,
  type ReviewActionKey,
  type ReviewItem,
} from "@pace/core";

import { type ActionDeps, type ActionResult, emit, fromStore, stamp, taskOf } from "./deps.ts";

export type ReviewActions = {
  /** Appends the action's events (corrections included) and rebuilds the state after a correction. */
  readonly runReviewAction: (item: ReviewItem, key: ReviewActionKey) => ActionResult;
  /** Marks a system-made outcome as seen and agreed. */
  readonly confirmAutoOutcome: (taskId: string) => ActionResult;
  /** Revokes a system-made outcome: the task is open again. */
  readonly undoAutoOutcome: (taskId: string) => ActionResult;
};

const isCorrectionInput = (input: EventInput): boolean =>
  input.type === "event.amended" || input.type === "event.revoked";

/** System events keep their source; everything else is this client's doing. */
const owned = (input: EventInput, source: ActionDeps["source"]): EventInput =>
  input.source === "system" ? input : { ...input, source };

const autoOutcomeOf = (
  deps: ActionDeps,
  taskId: string,
): Result<Closure, "action/not-auto-outcome" | "task/unknown"> => {
  const task = taskOf(deps, taskId);
  if (!task.ok) {
    return task;
  }
  const { closed } = task.value;
  return closed?.source === "system" ? ok(closed) : err("action/not-auto-outcome");
};

export const reviewActions = (deps: ActionDeps): ReviewActions => ({
  confirmAutoOutcome: async (taskId) => {
    const closed = autoOutcomeOf(deps, taskId);
    if (!closed.ok) {
      return closed;
    }
    if (closed.value.confirmed) {
      return err("action/nothing-to-do");
    }
    return await emit(deps, [
      stamp(deps, {
        type: "event.amended",
        payload: { targetId: closed.value.eventId, patch: { confirmed: true } },
      }),
    ]);
  },
  runReviewAction: async (item, key) => {
    const action = item.actions.find((candidate) => candidate.key === key);
    if (action === undefined) {
      return err("action/unknown-review-action");
    }
    const inputs = action.events.map((input) => owned(input, deps.source));
    const result = await emit(deps, inputs);
    if (result.ok && inputs.some((input) => isCorrectionInput(input))) {
      await deps.state.rematerialize();
    }
    return result;
  },
  undoAutoOutcome: async (taskId) => {
    const closed = autoOutcomeOf(deps, taskId);
    return closed.ok ? fromStore(await deps.state.revoke(closed.value.eventId)) : closed;
  },
});
