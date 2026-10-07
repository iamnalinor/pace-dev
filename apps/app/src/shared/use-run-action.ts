import { useCallback } from "react";

import type { ActionResult, Actions } from "@pace/client";
import type { Event } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { errorText } from "#app/format/action-error.ts";
import { useToast } from "#app/ui/toast.tsx";

export type RunOptions = {
  /** The toast after it worked; nothing is shown without it. */
  readonly success?: string;
  /** Adds "Undo" to the toast: it revokes what the action recorded. */
  readonly undo?: boolean;
};

/** Newest first, so a batch is taken back in the reverse order it was written. */
const revokeAll = async (actions: Actions, events: readonly Event[]): Promise<void> => {
  for (const event of events.toReversed()) {
    await actions.revoke(event.id);
  }
};

/**
Awaits an action and tells the user how it went: the error's sentence when it was refused,
the success toast (with Undo when asked) when it was applied. Resolves to whether it worked.
*/
export const useRunAction = (): ((
  result: ActionResult,
  options?: RunOptions,
) => Promise<boolean>) => {
  const { actions } = usePace();
  const toast = useToast();
  const t = useT();
  return useCallback(
    async (result, options = {}) => {
      const done = await result;
      if (!done.ok) {
        toast.show({ message: errorText(t, done.error) });
        return false;
      }
      if (options.success !== undefined) {
        const undo = {
          label: t("common.undo"),
          onPress: () => {
            void revokeAll(actions, done.value);
          },
        };
        toast.show({ message: options.success, ...(options.undo === true && { action: undo }) });
      }
      return true;
    },
    [actions, t, toast],
  );
};
