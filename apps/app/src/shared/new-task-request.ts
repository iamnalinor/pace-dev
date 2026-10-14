import { useEffect, useRef } from "react";

import { useIsScreenActive } from "#app/ui/screen-active.ts";

const listeners = new Set<() => void>();
/** When New task was last asked for and not yet taken; null when nothing waits. */
const pending: { at: null | number } = { at: null };

/** How long a request waits for a Now to come to the front (a navigation is quicker). */
export const NEW_TASK_REQUEST_MS = 2000;

/** Takes the request (whether one waited, still fresh); a stale one is dropped either way. */
const canTakeRequest = (): boolean => {
  const { at } = pending;
  pending.at = null;
  return at !== null && Date.now() - at <= NEW_TASK_REQUEST_MS;
};

/**
Asks for an empty task form (the sidebar's New task, N away from Now): the Now in front opens
it at once, or the one that comes to the front next does.
*/
export const requestNewTask = (): void => {
  pending.at = Date.now();
  for (const take of listeners) {
    take();
  }
};

/**
Opens the form when New task was asked for while this screen is in front: a Now behind
another tab waits until it is shown, so a form never opens out of sight. A request nobody took
within a couple of seconds is forgotten: a Now shown much later opens no form by surprise.
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
      if (canTakeRequest()) {
        openRef.current();
      }
    };
    take();
    listeners.add(take);
    return () => {
      listeners.delete(take);
    };
  }, [isActive]);
};
