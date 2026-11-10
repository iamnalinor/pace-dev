import Storage from "expo-sqlite/kv-store";

import type { DraftStorage } from "./drafts.ts";

/** Where the drafts' one record lives on the phone (the app's SQLite key-value store). */
const KEY = "pace.drafts";

/**
The phone keeps the drafts in expo-sqlite's key-value store, read and written synchronously so a
field restores its text in its first frames. A failing store keeps nothing; typing goes on.
*/
export const draftStorage: DraftStorage = {
  clear: () => {
    try {
      Storage.removeItemSync(KEY);
    } catch {
      // Nothing kept to clear.
    }
  },
  read: () => {
    try {
      return Storage.getItemSync(KEY);
    } catch {
      return null;
    }
  },
  write: (value) => {
    try {
      Storage.setItemSync(KEY, value);
    } catch {
      // Full or unavailable: the draft lives only in the field.
    }
  },
};
