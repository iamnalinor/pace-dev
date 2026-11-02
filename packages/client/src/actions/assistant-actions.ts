import { type ActionBody, newId, planAction, planActions } from "@pace/core";

import { type ActionDeps, type ActionResult, serially, stageEmit } from "./deps.ts";

/** Plans at approval time, when the latest local state is known. */
export type AssistantActions = {
  readonly applyAction: (action: ActionBody) => ActionResult;
  readonly applyActions: (actions: readonly ActionBody[]) => ActionResult;
};

export const assistantActions = (deps: ActionDeps): AssistantActions => {
  const context = () => ({
    deviceTz: deps.clock.deviceTz,
    newId,
    now: deps.clock.now(),
    source: deps.source,
  });
  return {
    applyAction: async (action) =>
      await serially(deps, async () => {
        const planned = planAction(deps.state.store.getState(), action, context());
        return planned.ok ? await stageEmit(deps, planned.value) : planned;
      }),
    applyActions: async (actions) =>
      await serially(deps, async () => {
        const planned = planActions(deps.state.store.getState(), actions, context());
        return planned.ok
          ? await stageEmit(deps, planned.value)
          : { ok: false, error: planned.error.error };
      }),
  };
};
