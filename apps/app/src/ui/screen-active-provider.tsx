import { type ReactNode, useLayoutEffect, useState } from "react";

import type { Liveness } from "@pace/client/react";

import { SceneContext, ScreenActiveContext } from "./screen-active.ts";

/** A screen's own handle: what `ScreenActive` was last told, and who listens. */
const createScene = (isActiveAtFirst: boolean) => {
  const listeners = new Set<() => void>();
  const scene = { isActive: isActiveAtFirst };
  const handle: Liveness = {
    isLive: () => scene.isActive,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    handle,
    set: (isActive: boolean): void => {
      if (scene.isActive === isActive) {
        return;
      }
      scene.isActive = isActive;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

/** Tells what is inside whether its screen is the one in front, both ways (see above). */
export const ScreenActive = ({
  children,
  isActive,
}: {
  readonly children: ReactNode;
  readonly isActive: boolean;
}) => {
  const [scene] = useState(() => createScene(isActive));
  // Before paint, so a shortcut or a view never acts for a screen that just went behind.
  useLayoutEffect(() => {
    scene.set(isActive);
  }, [isActive, scene]);
  return (
    <SceneContext value={scene.handle}>
      <ScreenActiveContext value={isActive}>{children}</ScreenActiveContext>
    </SceneContext>
  );
};
