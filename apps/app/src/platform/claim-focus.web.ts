import type { View } from "react-native";

/** How many frames a control tries to take focus while its modal is still showing its content. */
const FOCUS_FRAMES = 30;

/**
Puts keyboard focus on a control as the view it sits in opens, frame after frame until it holds:
a modal shows its content after it mounts (a hidden element takes no focus), and a sheet puts focus
on its first stop meanwhile, so a later frame takes it back (QA round 19 L5: the date picker
opened on "Previous month"). The target is a DOM node here. Returns how to stop trying.
*/
export const claimFocus = (target: () => null | View): (() => void) => {
  let frame = 0;
  let left = FOCUS_FRAMES;
  const attempt = (): void => {
    const element = target() as unknown as HTMLElement | null;
    element?.focus();
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
