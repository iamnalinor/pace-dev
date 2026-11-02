import type { Language } from "../i18n/language.ts";

/** Groups of digits are told apart by a narrow no-break space: it never wraps and never reads as a gap. */
const GROUP_SEPARATOR = "\u{202F}";

export type NumberOptions = {
  /** Digits after the separator, always shown (`1` → `3,0`). Absent: as many as the number has, up to three. */
  readonly fraction?: number;
};

const formatter = (language: Language, fraction: number | undefined): Intl.NumberFormat =>
  new Intl.NumberFormat(
    language,
    fraction === undefined
      ? { useGrouping: true }
      : { maximumFractionDigits: fraction, minimumFractionDigits: fraction, useGrouping: true },
  );

/** A number rounded to `fraction` digits, without the sign of a zero it rounded to. */
const rounded = (value: number, fraction = 3): number => {
  const scale = 10 ** fraction;
  const result = Math.round(value * scale) / scale;
  return result === 0 ? 0 : result;
};

/**
A number the way the language writes it: `3,3` in Russian, `3.3` in English, thousands grouped
(`1 284` with U+202F in Russian, `1,284` in English). Display text never builds a number by hand
with `toFixed` or `String(n)`; they print `3.3` and `1284` in every language.
*/
export const formatNumber = (
  value: number,
  language: Language,
  { fraction }: NumberOptions = {},
): string =>
  formatter(language, fraction)
    .formatToParts(rounded(value, fraction))
    .map((part) => (language === "ru" && part.type === "group" ? GROUP_SEPARATOR : part.value))
    .join("");

/** A whole number for display: `1284` → `1 284` in Russian, `1,284` in English. */
export const formatCount = (count: number, language: Language): string =>
  formatNumber(Math.round(count), language, { fraction: 0 });

/** A share for display: `30 %` in Russian (no-break space before the sign), `30%` in English. */
export const formatPercent = (percent: number, language: Language): string =>
  `${formatCount(percent, language)}${language === "ru" ? "\u{A0}" : ""}%`;
