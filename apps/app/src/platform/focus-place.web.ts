import type { RefObject } from "react";
import type { View } from "react-native";

import { isFocusLost } from "./move-focus.ts";

/**
After an editor in place closes (Escape, Cancel, Save), keyboard focus goes to the place it stood
in, a frame later once the field is gone and only where nothing else took it: the control there
(«Add description», the description's own button), else the place itself, so the next Tab goes on
from there and not from the top of the page (QA round 25 R25-09, bug class 5).
*/
export const focusPlace = (place: RefObject<null | View>): void => {
  requestAnimationFrame(() => {
    const element = place.current as unknown as HTMLElement | null;
    if (element === null || !isFocusLost()) {
      return;
    }
    const control = element.querySelector<HTMLElement>('[role="button"], button');
    if (control === null) {
      element.tabIndex = -1;
      element.focus();
    } else {
      control.focus();
    }
  });
};
