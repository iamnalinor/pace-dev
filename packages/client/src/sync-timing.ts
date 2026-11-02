/* The sync client's timing: its one pending run, and runs one after another. */

/** One pending run at a time: when it is due, and moving it earlier or later. */
export type RunTimer = {
  readonly cancel: () => void;
  /** Replaces the pending run with one in `delayMs`. */
  readonly in: (delayMs: number) => void;
  /** Whether a run is already due within `delayMs`. */
  readonly isDueWithin: (delayMs: number) => boolean;
};

export const createTimer = (run: () => void): RunTimer => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dueAt: number | undefined;
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
    dueAt = undefined;
  };
  return {
    cancel,
    /** Replaces the pending run with one in `delayMs`. */
    in: (delayMs: number): void => {
      cancel();
      dueAt = Date.now() + delayMs;
      timer = setTimeout(() => {
        timer = undefined;
        dueAt = undefined;
        run();
      }, delayMs);
    },
    /** Whether a run is already due within `delayMs`. */
    isDueWithin: (delayMs: number): boolean => dueAt !== undefined && dueAt <= Date.now() + delayMs,
  };
};

/** Runs tasks one after another, each after the previous one settled. */
export const createSerial = (): (<T>(task: () => Promise<T>) => Promise<T>) => {
  let tail: Promise<unknown> = Promise.resolve();
  return async <T>(task: () => Promise<T>): Promise<T> => {
    const previous = tail;
    // `new Promise`, not `Promise.withResolvers`: Hermes (Android) may lack the ES2024 call.
    let release: ((value: null) => void) | undefined;
    tail = new Promise<null>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      return await task();
    } finally {
      release?.(null);
    }
  };
};

/** Holds that may overlap: held while any is in place; each `release` counts once. */
export const createHolds = (): {
  readonly add: () => () => void;
  readonly isHeld: () => boolean;
} => {
  let count = 0;
  return {
    add: () => {
      count += 1;
      let isReleased = false;
      return () => {
        if (isReleased) {
          return;
        }

        isReleased = true;
        count -= 1;
      };
    },
    isHeld: () => count > 0,
  };
};

/** Settles once `work` has, or after `ms` at the latest. */
export const settledWithin = async (work: Promise<unknown>, ms: number): Promise<void> => {
  const timer: { id?: ReturnType<typeof setTimeout> } = {};
  try {
    await Promise.race([
      work,
      new Promise((resolve) => {
        timer.id = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer.id);
  }
};

/** `letGo` then `after`, once: called by its holder, or on its own after `ms`. */
export const expiringRelease = (letGo: () => void, ms: number, after: () => void): (() => void) => {
  const expiry: { id?: ReturnType<typeof setTimeout> } = {};
  const release = (): void => {
    clearTimeout(expiry.id);
    letGo();
    after();
  };
  expiry.id = setTimeout(release, ms);
  return release;
};
