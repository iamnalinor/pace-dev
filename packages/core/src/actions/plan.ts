import type { EventInput } from "../events/event-schema.ts";
import type { ActionError, PlanContext, Planned } from "./plan-context.ts";
import type { ActionBody } from "./schema.ts";

import { coreReducer, type CoreState } from "../materialize/core-state.ts";
import { err, ok, type Result } from "../result.ts";
import { domainOf } from "./kinds.ts";
import { planActivity } from "./plan-activity.ts";
import { planTask, type TaskAction } from "./plan-task.ts";

export type { ActionError, PlanContext } from "./plan-context.ts";

const isTaskAction = (action: ActionBody): action is TaskAction => domainOf(action.kind) === "task";

/**
The events a action writes once the person accepts it, stamped now by `ctx.source` (a past
block at its end, a start at its beginning). Tasks go through the retro rules like any write;
an id the state does not know is refused, as is a patch that changes nothing.
*/
export const planAction = (state: CoreState, action: ActionBody, ctx: PlanContext): Planned =>
  isTaskAction(action) ? planTask(state, action, ctx) : planActivity(state, action, ctx);

/** The first action of a batch that could not be planned, and why. */
export type BatchError = { readonly index: number; readonly error: ActionError };

/** The state with planned events folded in, so the next action sees what they write. */
const afterInputs = (
  state: CoreState,
  inputs: readonly EventInput[],
  ctx: PlanContext,
): CoreState => {
  const [first, ...rest] = inputs;
  if (first === undefined) {
    return state;
  }
  const event = { ...first, deviceId: "plan", id: ctx.newId(), recordedAt: ctx.now };
  return afterInputs(coreReducer(state, event), rest, ctx);
};

/** Corrections are not folded into the provisional reducer state. */
const deletedReference = (
  action: ActionBody,
  deletedTasks: ReadonlySet<string>,
  deletedActivities: ReadonlySet<string>,
): ActionError | null => {
  if ("taskId" in action && deletedTasks.has(action.taskId)) {
    return "action/unknown-task";
  }
  return "activityId" in action && deletedActivities.has(action.activityId)
    ? "action/unknown-activity"
    : null;
};

const planFrom = (
  state: CoreState,
  actions: readonly ActionBody[],
  {
    ctx,
    deletedActivities,
    deletedTasks,
    index,
  }: {
    readonly ctx: PlanContext;
    readonly deletedActivities: ReadonlySet<string>;
    readonly deletedTasks: ReadonlySet<string>;
    readonly index: number;
  },
): Result<readonly EventInput[], BatchError> => {
  const [first, ...rest] = actions;
  if (first === undefined) {
    return ok([]);
  }
  const deleted = deletedReference(first, deletedTasks, deletedActivities);
  if (deleted !== null) {
    return err({ error: deleted, index });
  }
  const planned = planAction(state, first, ctx);
  if (!planned.ok) {
    return err({ error: planned.error, index });
  }
  const after = planFrom(afterInputs(state, planned.value, ctx), rest, {
    ctx,
    deletedActivities:
      first.kind === "activity.delete"
        ? new Set([...deletedActivities, first.activityId])
        : deletedActivities,
    deletedTasks:
      first.kind === "task.delete" ? new Set([...deletedTasks, first.taskId]) : deletedTasks,
    index: index + 1,
  });
  return after.ok ? ok([...planned.value, ...after.value]) : after;
};

/**
Every action of an answer, planned in order over what the ones before write; the first that
cannot be planned refuses the batch. Revocations are tracked separately because the reducer
does not apply corrections to its provisional state.
*/
export const planActions = (
  state: CoreState,
  actions: readonly ActionBody[],
  ctx: PlanContext,
): Result<readonly EventInput[], BatchError> =>
  planFrom(state, actions, {
    ctx,
    deletedActivities: new Set(),
    deletedTasks: new Set(),
    index: 0,
  });
