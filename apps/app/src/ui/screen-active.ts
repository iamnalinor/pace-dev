import { createContext, use, useEffect } from "react";

import type { Liveness } from "@pace/client/react";

/**
Whether the screen a component sits on is the one in front. A tab left behind, or a screen
under a pushed one, stays mounted: its shortcuts must stay silent. Outside any screen (the
sidebar, a test) it counts as in front. A screen sets both contexts through `ScreenActive`
(`screen-active-provider.tsx`).
*/
export const ScreenActiveContext = createContext(true);

/**
The same answer as a handle that never changes: asked when it matters (an effect, a store
selector) and listened to, so a component that only acts on it is not rendered again every time
its screen is left or entered (bug-lessons 310).
*/
const NOTHING_TO_FORGET = (): void => undefined;

export const SceneContext = createContext<Liveness>({
  isLive: () => true,
  subscribe: () => NOTHING_TO_FORGET,
});

/** Renders again whenever the screen is left or entered: for what draws differently then. */
export const useIsScreenActive = (): boolean => use(ScreenActiveContext);

/** The screen's handle: never renders for a change of front (the app's views read it). */
export const useScene = (): Liveness => use(SceneContext);

/**
Runs `effect` for as long as the screen is in front, cleaning up when it is left: a shortcut, a
listener. The component is not rendered for the change. `effect` is the caller's `useCallback`:
it runs again when it changes.
*/
export const useWhileScreenActive = (effect: () => (() => void) | undefined): void => {
  const scene = useScene();
  useEffect(() => {
    let stop: (() => void) | undefined;
    const sync = (): void => {
      stop?.();
      stop = scene.isLive() ? effect() : undefined;
    };
    sync();
    const forget = scene.subscribe(sync);
    return () => {
      forget();
      stop?.();
    };
  }, [scene, effect]);
};
