import { useEffect, useRef, useState } from "react";

import { useIsWide } from "#app/ui/layout.ts";

/** A start this soon after the bar was used came from it: the bar stays as the finger left it. */
const BAR_USE_MS = 5000;

/**
Whether the typed field shows (the four tiles always do, Q12): always on a wide window or with
nothing running. On a phone it folds under «Start something else» (the kit's `Disclosure`) when
something starts that the bar did not start (Now opened on it, the store loaded it late, the bot or
another device started it), and when the bar and the nav bar would take more than 40 % of the
window (`isOverBudget`, measured; spec §5.1 fold step 2), until a tap unfolds it or that activity
stops. A start made in the open bar never folds it under the finger, and a field the person
unfolded stays open over the budget: they asked for it.
*/
export const useFold = (
  runningId: null | string,
  {
    isOverBudget = false,
    isPicking,
    lastUseRef,
  }: {
    readonly isOverBudget?: boolean;
    readonly isPicking: boolean;
    readonly lastUseRef: { readonly current: number };
  },
) => {
  const isWide = useIsWide();
  const [foldedFor, setFoldedFor] = useState(runningId);
  const openedByHandRef = useRef(false);
  useEffect(() => {
    if (!(runningId !== null && !isPicking && Date.now() - lastUseRef.current > BAR_USE_MS)) {
      return;
    }

    openedByHandRef.current = false;
    setFoldedFor(runningId);
  }, [isPicking, lastUseRef, runningId]);
  useEffect(() => {
    if (!isOverBudget || runningId === null || isPicking) {
      return;
    }
    // Over the budget, the field folds once the bar has been left alone for a moment.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const foldWhenLeft = (): void => {
      if (openedByHandRef.current) {
        return;
      }
      const left = BAR_USE_MS - (Date.now() - lastUseRef.current);
      if (left <= 0) {
        setFoldedFor(runningId);
      } else {
        timer = setTimeout(foldWhenLeft, left);
      }
    };
    foldWhenLeft();
    return () => {
      clearTimeout(timer);
    };
  }, [isOverBudget, isPicking, lastUseRef, runningId]);
  const isFoldable = !isWide && runningId !== null;
  const isUnfolded = foldedFor === null || foldedFor !== runningId;
  return {
    isFoldable,
    isShown: !isFoldable || isUnfolded,
    isUnfolded,
    toggle: (): void => {
      openedByHandRef.current = !isUnfolded;
      setFoldedFor(isUnfolded ? runningId : null);
    },
  };
};
