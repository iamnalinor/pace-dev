import type { Language } from "@pace/core";

/**
The account's language as this device last knew it, read synchronously at the first render. A
phone has no first paint to protect (its splash covers the load): nothing is kept here.
*/
export const storedLanguage = (): Language | null => null;

/** Keeps the signed-in account's language for the next start; `null` forgets it (signed out). */
export const storeLanguage = (_language: Language | null): void => undefined;
