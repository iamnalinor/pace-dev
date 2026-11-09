import { type RefObject, useEffect, useRef } from "react";

import { pushEscapeTaker } from "./escape-first.ts";
import { forgetControls } from "./tooltip-controls.ts";
import { WARM_MS } from "./tooltip-place.ts";

/* The web tooltip's moves that are not about its look: warmth, dismissal, the timer. */

/**
When a tooltip last closed (or 0): a trigger hovered soon after shows its own at once, so moving
along a row of icon buttons reads each name without the delay again. One page, one pointer.
*/
const warmth = { closedAt: 0, openCount: 0 };

export const isWarm = (): boolean => warmth.openCount > 0 || Date.now() - warmth.closedAt < WARM_MS;

/**
While it shows: Escape anywhere (taken before any shortcut or dialog, `escape-first.ts`) and a
scroll (it would be left behind) take it away.
*/
export const useDismiss = (isShown: boolean, hide: () => void): void => {
  const hideRef = useRef(hide);
  useEffect(() => {
    hideRef.current = hide;
  });
  useEffect(() => {
    if (!isShown) {
      return;
    }
    warmth.openCount += 1;
    return () => {
      warmth.openCount -= 1;
      warmth.closedAt = Date.now();
    };
  }, [isShown]);
  useEffect(() => {
    if (!isShown) {
      return;
    }

    // Only the tooltip goes: the pane, sheet or dialog under it hears nothing of this Escape.
    return pushEscapeTaker(() => {
      hideRef.current();
    });
  }, [isShown]);
  useEffect(() => {
    if (!isShown || typeof globalThis.addEventListener !== "function") {
      return;
    }
    const dismiss = (): void => {
      // The page moved: the controls read around the trigger are where they were no more.
      forgetControls();
      hideRef.current();
    };
    globalThis.addEventListener("scroll", dismiss, { capture: true });
    globalThis.addEventListener("resize", dismiss);
    return () => {
      globalThis.removeEventListener("scroll", dismiss, { capture: true });
      globalThis.removeEventListener("resize", dismiss);
    };
  }, [isShown]);
};

/** Whether `node` (a DOM node, react-native-web gives a View its own) holds `target`. */
const isHolding = (node: unknown, target: EventTarget | null): boolean => {
  const element = node as null | Partial<Pick<Node, "contains">>;
  return typeof element?.contains === "function" && element.contains(target as Node | null);
};

/**
While a hover tooltip shows, a pointer move anywhere off its trigger and its bubble starts its
hide: a leave the trigger or the bubble never heard (the bubble moved out from under a resting
pointer, the trigger re-laid under it) cannot keep it up for good.
*/
export const usePointerAway = (
  isHoverShown: boolean,
  {
    bubbleRef,
    wrapperRef,
  }: { readonly bubbleRef: RefObject<unknown>; readonly wrapperRef: RefObject<unknown> },
  onAway: () => void,
): void => {
  const onAwayRef = useRef(onAway);
  useEffect(() => {
    onAwayRef.current = onAway;
  });
  useEffect(() => {
    if (!isHoverShown || typeof globalThis.addEventListener !== "function") {
      return;
    }
    const onMove = (event: Event): void => {
      if (
        !isHolding(wrapperRef.current, event.target) &&
        !isHolding(bubbleRef.current, event.target)
      ) {
        onAwayRef.current();
      }
    };
    globalThis.addEventListener("pointermove", onMove, { capture: true, passive: true });
    return () => {
      globalThis.removeEventListener("pointermove", onMove, { capture: true });
    };
  }, [bubbleRef, isHoverShown, wrapperRef]);
};

/** One timer at a time: the pending show (the hover delay) or the pending hide (the grace). */
export const useTimer = () => {
  const timerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const cancel = (): void => {
    if (timerRef.current === null) {
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => cancel, []);
  return {
    after: (ms: number, run: () => void): void => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        run();
      }, ms);
    },
    cancel,
  };
};
