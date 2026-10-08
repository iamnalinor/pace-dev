import { useCallback } from "react";

import type { ActionResult } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { errorText } from "#app/format/action-error.ts";
import { type ToastInput, useToast } from "#app/ui/toast.tsx";

/**
What may follow a success. Nothing is shown after an action that simply worked (the screen
changing is the answer, and History undoes); only an offer to do one more thing is.
*/
export type RunOptions = {
  readonly success: string;
  readonly action: NonNullable<ToastInput["action"]>;
};

/** Awaits an action: a refusal shows its sentence, a success only its follow-up offer, if any. */
export const useRunAction = (): ((
  result: ActionResult,
  options?: RunOptions,
) => Promise<boolean>) => {
  const toast = useToast();
  const t = useT();
  return useCallback(
    async (result, options) => {
      const done = await result;
      if (!done.ok) {
        toast.show({ message: errorText(t, done.error) });
        return false;
      }
      if (options !== undefined) {
        toast.show({ action: options.action, message: options.success });
      }
      return true;
    },
    [t, toast],
  );
};
