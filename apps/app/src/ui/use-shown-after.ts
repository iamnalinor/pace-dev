import { useEffect, useState } from "react";

/**
How long a wait lasts before a skeleton shows (spec §4.2.23, §6 "skeleton → content"): a load
that answers sooner shows nothing at all, so a fast screen never flashes grey bars.
*/
export const SKELETON_DELAY_MS = 300;

/** False until `ms` have passed since the first render, then true. */
export const useIsShownAfter = (ms: number): boolean => {
  const [isShown, setIsShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsShown(true);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [ms]);
  return isShown;
};
