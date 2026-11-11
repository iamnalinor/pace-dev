import type { Language } from "@pace/core";

/** The key `public/theme-boot.js` reads before the bundle to set `<html lang>`. */
const KEY = "pace.language";

/**
The account's language as this browser last knew it, read synchronously: the first paint of a
signed-in Russian account is Russian, not the browser's English for the seconds until the local
copy is read (F-DAT-04, bug-lessons 22). Nothing where the storage is empty or blocked.
*/
export const storedLanguage = (): Language | null => {
  try {
    const stored = globalThis.localStorage.getItem(KEY);
    return stored === "ru" || stored === "en" ? stored : null;
  } catch {
    return null;
  }
};

/** Keeps the signed-in account's language for the next load; `null` forgets it (signed out). */
export const storeLanguage = (language: Language | null): void => {
  try {
    if (language === null) {
      globalThis.localStorage.removeItem(KEY);
    } else {
      globalThis.localStorage.setItem(KEY, language);
    }
  } catch {
    // Blocked site data: the next load starts in the browser's language, as before.
  }
};
