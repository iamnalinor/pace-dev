import type { View } from "react-native";

import { type RefObject, useEffect } from "react";

import { isFocusLost, moveFocus } from "./move-focus.ts";

/**
Focus back on the anchor once a popover is gone, where nothing else took it. react-native-web's
modal gives focus back to what held it when the modal's effect ran: a field inside that focused
itself first (the Task picker's search) was that element, and focus fell to the page (QA round 24
R24-05). A frame later, after the modal's own try.
*/
export const useFocusBack = (anchor: RefObject<null | View>, isMounted: boolean): void => {
  useEffect(() => {
    if (!isMounted) {
      return;
    }
    // The control it opened from, as it was then: the tile stays while its popover comes and goes.
    const opener = anchor.current;
    return () => {
      requestAnimationFrame(() => {
        if (isFocusLost()) {
          moveFocus(opener);
        }
      });
    };
  }, [anchor, isMounted]);
};
