import type { DraftStorage } from "./drafts.ts";

/** The drafts' one record in the profile's localStorage. */
const KEY = "pace.drafts";

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/**
The browser keeps the drafts in localStorage. It can be missing or throw (a private window,
blocked site data, a full quota): then nothing is kept and typing goes on.
*/
export const draftStorage: DraftStorage = {
  clear: () => {
    try {
      storage()?.removeItem(KEY);
    } catch {
      // Blocked: nothing was kept.
    }
  },
  read: () => {
    try {
      return storage()?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  },
  write: (value) => {
    try {
      storage()?.setItem(KEY, value);
    } catch {
      // Blocked or full: the draft lives only in the field.
    }
  },
};
