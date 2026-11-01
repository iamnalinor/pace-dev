import { useCallback, useEffect, useRef } from "react";
import { useStore } from "zustand";

import { usePace } from "#app/app-state.tsx";

/** Triggers this close together (a return and the notice refresh it brings) make one call. */
const SETTLE_MS = 250;

/**
`onChange`, after a moment, whenever a sign-in notice arrives or is answered once the feed has
loaded (a new browser elsewhere, a Not me from another device): a list of sessions follows it.
The feed's first load is no news. Returns the same settled call, for other triggers (a return to
the app) to share, so triggers close together make one request (QA round 15 L9).
*/
export const useSignInsChanged = (onChange: () => void): (() => void) => {
  const { notifications } = usePace();
  const signIns = useStore(notifications.store, (state) =>
    state.status === "ready"
      ? state.items
          .filter((item) => item.kind === "login")
          .map((item) => `${item.id}:${item.resolution ?? ""}`)
          .join(",")
      : null,
  );
  const latestRef = useRef(onChange);
  useEffect(() => {
    latestRef.current = onChange;
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settled = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      latestRef.current();
    }, SETTLE_MS);
  }, []);
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
    },
    [],
  );
  const shownRef = useRef(signIns);
  useEffect(() => {
    const shown = shownRef.current;
    shownRef.current = signIns;
    if (shown !== null && signIns !== null && shown !== signIns) {
      settled();
    }
  }, [settled, signIns]);
  return settled;
};
