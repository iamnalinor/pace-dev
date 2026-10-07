import type { Language } from "@pace/core";

const ORDINAL_SUFFIX_EN: Readonly<Record<Intl.LDMLPluralRule, string>> = {
  few: "rd",
  many: "th",
  one: "st",
  other: "th",
  two: "nd",
  zero: "th",
};

/** `2` → `2nd` / `2-е` (neuter, as in "2-е место"). */
export const formatOrdinal = (n: number, language: Language): string => {
  switch (language) {
    case "en": {
      return `${n}${ORDINAL_SUFFIX_EN[new Intl.PluralRules("en", { type: "ordinal" }).select(n)]}`;
    }
    case "ru": {
      return `${n}-е`;
    }
  }
};

/** `["3", "4"]` → `3 and 4` / `3 и 4`. */
export const formatList = (items: readonly string[], language: Language): string =>
  new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(items);

/** `0.65` → `65%`. */
export const formatPercent = (fraction: number, language: Language): string =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 0, style: "percent" }).format(fraction);

/** Up to two decimals, in the language's notation. */
export const formatNumber = (value: number, language: Language): string =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
