import type { RefObject } from "react";
import type { View } from "react-native";

import { isFocusLost } from "./move-focus.web.ts";

/** How many frames the toast watches for the focus its action's control dropped. */
const WATCH_FRAMES = 10;

/**
After a delete or a swap the control that held keyboard focus is gone and the page holds it, so
the next Tab started from the top, 17 stops from the toast's Undo (QA round 27 R27-09). For a few
frames after an Undo toast shows, focus that is lost goes to its action; focus the person put
anywhere stays. Returns how to stop watching.
*/
export const focusUndoIfLost = (place: RefObject<null | View>): (() => void) => {
  let frame = 0;
  let left = WATCH_FRAMES;
  const watch = (): void => {
    const element = place.current as unknown as HTMLElement | null;
    const control = element?.querySelector<HTMLElement>('[role="button"], button') ?? null;
    if (control !== null && isFocusLost()) {
      control.focus();
      return;
    }
    left -= 1;
    if (left > 0) {
      frame = requestAnimationFrame(watch);
    }
  };
  frame = requestAnimationFrame(watch);
  return () => {
    cancelAnimationFrame(frame);
  };
};
