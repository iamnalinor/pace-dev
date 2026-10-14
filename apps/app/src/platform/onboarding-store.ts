/**
The walk-through being finished, told to whoever shows its state. A screen that read "not yet" from
storage once (the route gate lives as long as the app) would otherwise keep sending the phone back
into it after the last step.
*/
const listeners = new Set<() => void>();

/** Calls `listener` whenever the phone is marked as onboarded; returns how to stop. */
export const onOnboarded = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifyOnboarded = (): void => {
  for (const listener of listeners) {
    listener();
  }
};
