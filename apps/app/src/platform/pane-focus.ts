import type { View } from "react-native";

import { type RefObject, useEffect } from "react";

import { moveFocus } from "./move-focus.ts";

/**
A pane beside the content (the shell's inspector) takes the screen reader's focus when it opens
(UI review I4). The web build swaps in `pane-focus.web.ts`, which also hands the keyboard's focus
back to the control that opened it when it closes.
*/
export const usePaneFocus = (paneRef: RefObject<null | View>, isShown: boolean): void => {
  useEffect(() => {
    if (isShown) {
      moveFocus(paneRef.current);
    }
  }, [isShown, paneRef]);
};
