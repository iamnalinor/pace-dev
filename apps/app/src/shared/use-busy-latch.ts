import { useCallback, useRef, useState } from "react";

/**
One run at a time for a control whose press starts slow work (a server check, a move, a restart):
the latch is read synchronously, since two taps in one frame both see the state still idle.
`isBusy` drives the control's spinner; a run that answers `"hold"` leaves it busy.
*/
export const useBusyLatch = (): {
  readonly isBusy: boolean;
  /** Runs `work` unless a run is under way; a work that answers `"hold"` keeps the control busy. */
  readonly run: (work: () => unknown) => Promise<void>;
} => {
  const [isBusy, setIsBusy] = useState(false);
  const latchRef = useRef(false);
  const run = useCallback(async (work: () => unknown): Promise<void> => {
    if (latchRef.current) {
      return;
    }
    latchRef.current = true;
    setIsBusy(true);
    let outcome: unknown;
    try {
      outcome = await work();
    } finally {
      if (outcome !== "hold") {
        latchRef.current = false;
        setIsBusy(false);
      }
    }
  }, []);
  return { isBusy, run };
};
