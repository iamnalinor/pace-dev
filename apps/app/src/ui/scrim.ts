import { useEffect, useSyncExternalStore } from "react";

/**
Whether a scrim (the dim behind a sheet or dialog) is up. The web document reads it to dim its
`theme-color` with the screen (`DocumentTheme`); a count, so two stacked sheets keep it up until
the last one closes. Kept apart from `Sheet` so a rewritten sheet only has to call `useScrim`.
*/
const scrims = { up: 0 };
const listeners = new Set<() => void>();

const change = (by: number): void => {
  scrims.up += by;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Declares a scrim while `isUp` (a visible sheet calls this with its `visible`). */
export const useScrim = (isUp: boolean): void => {
  useEffect(() => {
    if (!isUp) {
      return;
    }
    change(1);
    return () => {
      change(-1);
    };
  }, [isUp]);
};

/** True while any scrim is up. */
export const useIsScrimUp = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => scrims.up > 0,
    () => false,
  );
