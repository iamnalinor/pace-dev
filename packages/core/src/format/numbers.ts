import type { Language } from "../i18n/language.ts";

/** Groups of digits are told apart by a narrow no-break space: it never wraps and never reads as a gap. */
const GROUP_SEPARATOR = "\u{202F}";

const SEPARATORS: Readonly<Record<Language, { readonly decimal: string; readonly group: string }>> =
  {
    en: { decimal: ".", group: "," },
    ru: { decimal: ",", group: GROUP_SEPARATOR },
  };

/** Fraction digits shown when the caller names none: as many as the number has, up to three. */
const DEFAULT_FRACTION = 3;
const GROUP_SIZE = 3;

export type NumberOptions = {
  /** Digits after the separator, always shown (`1` → `3,0`). Absent: as many as the number has, up to three. */
  readonly fraction?: number;
};

const formatters = new Map<string, Intl.NumberFormat | null>();

/**
One formatter per language and fraction, built on first use. `null` when the platform has no
usable `Intl.NumberFormat` (missing, throwing, or without `formatToParts`): numbers are then
written by hand.
*/
const formatter = (language: Language, fraction: number | undefined): Intl.NumberFormat | null => {
  const key = `${language}:${String(fraction)}`;
  if (!formatters.has(key)) {
    try {
      const made = new Intl.NumberFormat(
        language,
        fraction === undefined
          ? { useGrouping: true }
          : { maximumFractionDigits: fraction, minimumFractionDigits: fraction, useGrouping: true },
      );
      // eslint-disable-next-line functional/immutable-data -- memo of formatters built on first use
      formatters.set(key, typeof made.formatToParts === "function" ? made : null);
    } catch {
      // eslint-disable-next-line functional/immutable-data -- memo: this platform has no usable formatter
      formatters.set(key, null);
    }
  }
  return formatters.get(key) ?? null;
};

/** A number rounded to `fraction` digits, without the sign of a zero it rounded to. */
const rounded = (value: number, fraction = DEFAULT_FRACTION): number => {
  const scale = 10 ** fraction;
  const result = Math.round(value * scale) / scale;
  return result === 0 ? 0 : result;
};

/** `1284567` → `1,284,567` with the language's group separator. */
const grouped = (digits: string, separator: string): string =>
  digits.length <= GROUP_SIZE
    ? digits
    : `${grouped(digits.slice(0, -GROUP_SIZE), separator)}${separator}${digits.slice(-GROUP_SIZE)}`;

const withoutTrailingZeros = (digits: string): string =>
  digits.endsWith("0") ? withoutTrailingZeros(digits.slice(0, -1)) : digits;

/** The by-hand writing, for a platform whose `Intl.NumberFormat` is not there. */
const written = (value: number, language: Language, fraction: number | undefined): string => {
  const { decimal, group } = SEPARATORS[language];
  const [whole = "0", part = ""] = Math.abs(value)
    .toFixed(fraction ?? DEFAULT_FRACTION)
    .split(".", 2);
  const kept = fraction === undefined ? withoutTrailingZeros(part) : part;
  const tail = kept === "" ? "" : `${decimal}${kept}`;
  return `${value < 0 ? "-" : ""}${grouped(whole, group)}${tail}`;
};

const viaIntl = (
  value: number,
  language: Language,
  fraction: number | undefined,
): null | string => {
  try {
    return (
      formatter(language, fraction)
        ?.formatToParts(value)
        .map((part) => (language === "ru" && part.type === "group" ? GROUP_SEPARATOR : part.value))
        .join("") ?? null
    );
  } catch {
    return null;
  }
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
): string => {
  const shown = rounded(value, fraction);
  return viaIntl(shown, language, fraction) ?? written(shown, language, fraction);
};

/** A whole number for display: `1284` → `1 284` in Russian, `1,284` in English. */
export const formatCount = (count: number, language: Language): string =>
  formatNumber(Math.round(count), language, { fraction: 0 });

/** A share for display: `30 %` in Russian (no-break space before the sign), `30%` in English. */
export const formatPercent = (percent: number, language: Language): string =>
  `${formatCount(percent, language)}${language === "ru" ? "\u{A0}" : ""}%`;
