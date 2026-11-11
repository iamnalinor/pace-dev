import type { View } from "react-native";

import type { ClaimOptions } from "./claim-focus.ts";

/** How many frames a control tries to take focus while its modal is still showing its content. */
const FOCUS_FRAMES = 30;

/**
Puts keyboard focus on a control as the view it sits in opens, frame after frame until it holds:
a modal shows its content after it mounts (a hidden element takes no focus), and a sheet puts focus
on its first stop meanwhile, so a later frame takes it back (QA round 19 L5: the date picker
opened on "Previous month"). The target is a DOM node here. Returns how to stop trying. Inside an
overlay that reveals the opening view itself, `preventScroll` keeps the browser from scrolling to
the control: its scroll, a frame later, cut the overlay's reveal short (R28-03, bug-lessons 350).
*/
export const claimFocus = (
  target: () => null | View,
  { preventScroll = false }: ClaimOptions = {},
): (() => void) => {
  let frame = 0;
  let left = FOCUS_FRAMES;
  const attempt = (): void => {
    const element = target() as unknown as HTMLElement | null;
    element?.focus({ preventScroll });
    left -= 1;
    if ((element === null || document.activeElement !== element) && left > 0) {
      frame = requestAnimationFrame(attempt);
    }
  };
  frame = requestAnimationFrame(attempt);
  return () => {
    cancelAnimationFrame(frame);
  };
};
