import type { SignOutNotes } from "@pace/client";

/** Next to the session itself in the profile's localStorage, which every tab reads. */
const NOTE_KEY = "pace.session.ended";

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/**
The note a tab that logs out leaves the other tabs of the profile (fix round 5 V1). Blocked
storage keeps none: the other tabs then say "another device", the default when nobody said it was
this browser.
*/
export const createSignOutNotes = (): SignOutNotes => ({
  leave: (mark) => {
    try {
      storage()?.setItem(NOTE_KEY, mark);
    } catch {
      // Blocked or full: no word left, the safe default stands.
    }
    return Promise.resolve();
  },
  read: () => {
    try {
      return Promise.resolve(storage()?.getItem(NOTE_KEY) ?? null);
    } catch {
      return Promise.resolve(null);
    }
  },
  withdraw: (mark) => {
    try {
      const kept = storage();
      // Only its own: a newer note (another tab's log-out since) stays.
      if (kept?.getItem(NOTE_KEY) === mark) {
        kept.removeItem(NOTE_KEY);
      }
    } catch {
      // Blocked: there was no note to take back.
    }
    return Promise.resolve();
  },
});
