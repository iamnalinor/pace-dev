/** Persistent actor wake-up. Setting replaces it; callers use armEarliest when only earlier is safe. */
export type Scheduler = {
  readonly getAlarm: () => Promise<null | number>;
  readonly setAlarm: (at: number) => Promise<void>;
  readonly deleteAlarm: () => Promise<void>;
};
