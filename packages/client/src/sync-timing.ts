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
