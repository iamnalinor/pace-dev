import {
  type Action,
  type BatchError,
  type EventInput,
  newId,
  planActions,
  type Result,
  t,
} from "@pace/core";

import { applyInputs, type Turn, zoneOf } from "./turn.ts";

/** The events of every action as the bot writes them now, the text as a task's source. */
export const planAll = (
  turn: Turn,
  { actions, text }: { readonly text: string; readonly actions: readonly Action[] },
): Result<readonly EventInput[], BatchError> =>
  planActions(turn.state, actions, {
    deviceTz: zoneOf(turn.state),
    newId: () => newId(),
    now: turn.now,
    source: "bot",
    sourceText: text,
  });

/**
Accept: the actions planned now, over the state now, and written. `failure` is `null` once done;
`taskId` names the task it created, if any.
*/
export const accept = async (
  turn: Turn,
  pending: { readonly text: string; readonly actions: readonly Action[] },
): Promise<{ readonly failure: null | string; readonly taskId: null | string }> => {
  const planned = planAll(turn, pending);
  if (!planned.ok) {
    return {
      failure: t(turn.state.settings.language, "bot.failed", { reason: planned.error.error }),
      taskId: null,
    };
  }
  const created = planned.value.find((input) => input.type === "task.created");
  return {
    failure: await applyInputs(turn, planned.value),
    taskId: created?.type === "task.created" ? created.payload.taskId : null,
  };
};
