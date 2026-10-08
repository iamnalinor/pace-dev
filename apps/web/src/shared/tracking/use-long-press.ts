import { type PointerEvent, useRef } from "react";

/** How long a press must last to count as "press and hold". */
export const LONG_PRESS_MS = 500;
/** A click this soon after a hold belongs to the hold and is swallowed. */
const SWALLOW_CLICK_MS = 1000;

export type LongPressHandlers = {
  readonly onClick: () => void;
  readonly onContextMenu: (event: { preventDefault: () => void }) => void;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerLeave: () => void;
  readonly onPointerUp: () => void;
};

/**
A tap runs `onTap`; holding for `LONG_PRESS_MS` (or a right click, or the keyboard's context
menu key) runs `onLongPress` instead. A touch hold also raises a context menu on Android:
it opens the editor once, and the click that may follow the hold is swallowed.
*/
export const useLongPress = (onTap: () => void, onLongPress: () => void): LongPressHandlers => {
  const timerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const heldAtRef = useRef(0);
  const clear = (): void => {
    if (timerRef.current === null) {
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const hold = (): void => {
    if (Date.now() - heldAtRef.current < SWALLOW_CLICK_MS) {
      return;
    }
    heldAtRef.current = Date.now();
    onLongPress();
  };
  return {
    onClick: () => {
      if (Date.now() - heldAtRef.current < SWALLOW_CLICK_MS) {
        return;
      }
      onTap();
    },
    onContextMenu: (event) => {
      event.preventDefault();
      clear();
      hold();
    },
    onPointerDown: (event) => {
      if (event.button !== 0) {
        return;
      }
      clear();
      timerRef.current = setTimeout(hold, LONG_PRESS_MS);
    },
    onPointerLeave: clear,
    onPointerUp: clear,
  };
};
