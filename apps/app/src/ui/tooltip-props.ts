import type { ReactNode } from "react";

/** What a tooltip takes, on the phone and on the web alike. */
export type TooltipProps = {
  readonly children: ReactNode;
  /** Fills its container (a Week block sized by its time), so the trigger inside can too. */
  readonly isFilling?: boolean;
  readonly label: string | undefined;
  /** False for a control whose tap changes the screen anyway (a bubble would be left behind). */
  readonly showsOnTap?: boolean;
};
