import type { ReactNode } from "react";

/** What a tooltip takes, on the phone and on the web alike. */
export type TooltipProps = {
  readonly children: ReactNode;
  /** Fills its container (a Week block sized by its time), so the trigger inside can too. */
  readonly isFilling?: boolean;
  /**
  Says why a control is unavailable: shown the moment the pointer is over it, with no hover delay
  (owner, feedback-4; spec §4.2.31).
  */
  readonly isImmediate?: boolean;
  readonly label: string | undefined;
};
