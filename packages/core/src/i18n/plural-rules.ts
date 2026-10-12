import type { Language } from "./language.ts";

export type PluralCategory = "few" | "many" | "one" | "other";

/** Russian: 1, 21, 101 → one; 2–4, 22–24 → few; the rest, 11–14 included → many. */
const russian = (count: number): PluralCategory => {
  const units = Math.abs(count) % 10;
  const tens = Math.abs(count) % 100;
  if (units === 1 && tens !== 11) {
    return "one";
  }
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? "few" : "many";
};

/**
CLDR plural categories for the app's languages, written out: Hermes on Android has no
`Intl.PluralRules` (its Intl is Collator, DateTimeFormat and NumberFormat only), and the
plural forms are shared with it. A fraction is "other" in both languages.
*/
export const pluralCategory = (language: Language, count: number): PluralCategory => {
  if (!Number.isSafeInteger(count)) {
    return "other";
  }

  switch (language) {
    case "en": {
      return count === 1 ? "one" : "other";
    }
    case "ru": {
      return russian(count);
    }
  }
};
