import { useEffect, useState } from "react";

import { useIsWide } from "#app/ui/layout.ts";

/** A start this soon after the bar was used came from it: the bar stays as the finger left it. */
const BAR_USE_MS = 5000;

/**
Whether the typed field shows (the four tiles always do, Q12): always on a wide window or with
nothing running. On a phone it folds under «Start something else» (the kit's `Disclosure`) when something starts that the bar did not start (Now opened on it, the
store loaded it late, the bot or another device started it), until a tap unfolds them or that
activity stops. A start made in the open bar never folds it under the finger.
*/
export const useFold = (
  runningId: null | string,
  {
    isPicking,
    lastUseRef,
  }: { readonly isPicking: boolean; readonly lastUseRef: { readonly current: number } },
) => {
  const isWide = useIsWide();
  const [foldedFor, setFoldedFor] = useState(runningId);
  useEffect(() => {
    if (runningId !== null && !isPicking && Date.now() - lastUseRef.current > BAR_USE_MS) {
      setFoldedFor(runningId);
    }
  }, [isPicking, lastUseRef, runningId]);
  const isFoldable = !isWide && runningId !== null;
  const isUnfolded = foldedFor === null || foldedFor !== runningId;
  return {
    isFoldable,
    isShown: !isFoldable || isUnfolded,
    isUnfolded,
    toggle: (): void => {
      setFoldedFor(isUnfolded ? runningId : null);
    },
  };
};
