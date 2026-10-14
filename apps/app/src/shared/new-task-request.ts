import { useEffect, useRef } from "react";

import { useIsScreenActive } from "#app/ui/screen-active.ts";

const listeners = new Set<() => void>();
const pending = { isWaiting: false };

/**
Asks for an empty task form (the sidebar's New task, N away from Now): the Now in front opens
it at once, or the one that comes to the front next does.
*/
export const requestNewTask = (): void => {
  pending.isWaiting = true;
  for (const take of listeners) {
    take();
  }
};

/**
Opens the form when New task was asked for while this screen is in front: a Now behind
another tab waits until it is shown, so a form never opens out of sight.
*/
export const useNewTaskRequest = (open: () => void): void => {
  const isActive = useIsScreenActive();
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const take = (): void => {
      if (!pending.isWaiting) {
        return;
      }

      pending.isWaiting = false;
      openRef.current();
    };
    take();
    listeners.add(take);
    return () => {
      listeners.delete(take);
    };
  }, [isActive]);
};
