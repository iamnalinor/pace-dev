import { minutesBetween, startOfDayIn } from "../time.ts";
import { en } from "./en.ts";
import { ru } from "./ru.ts";

export type Language = "en" | "ru";

export const LANGUAGES: readonly Language[] = ["en", "ru"];

export type MessageKey = keyof typeof en;

export type MessageParams = Readonly<Record<string, number | string>>;

const catalogs: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = { en, ru };

const interpolate = (text: string, params: MessageParams | undefined): string =>
  text.replaceAll(/\{(\w+)\}/g, (match, name: string) => {
    const value = params?.[name];
    return value === undefined ? match : String(value);
  });

/** Looks up `key` in the language's catalog and fills `{name}` placeholders. */
export const t = (language: Language, key: MessageKey, params?: MessageParams): string =>
  interpolate(catalogs[language][key], params);

export type PluralForms = {
  readonly one: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
};

/** Chooses the CLDR plural form for `count` and fills `{count}` in it. */
export const plural = (language: Language, count: number, forms: PluralForms): string => {
  const category = new Intl.PluralRules(language).select(count);
  const chosen = (): string => {
    switch (category) {
      case "one": {
        return forms.one;
      }
      case "few": {
        return forms.few ?? forms.other;
      }
      case "many": {
        return forms.many ?? forms.other;
      }
      case "zero":
      case "two":
      case "other": {
        return forms.other;
      }
    }
  };
  return interpolate(chosen(), { count });
};

const DURATION_UNITS: Readonly<Record<Language, { readonly h: string; readonly m: string }>> = {
  en: { h: "h", m: "m" },
  ru: { h: " ч", m: " м" },
};

/** `90` → `1h 30m` / `1 ч 30 м`; `0` → `0m`. */
export const formatDuration = (minutes: number, language: Language): string => {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const units = DURATION_UNITS[language];
  const parts = [
    ...(hours > 0 ? [`${hours}${units.h}`] : []),
    ...(hours === 0 || rest > 0 ? [`${rest}${units.m}`] : []),
  ];
  return parts.join(" ");
};

const RELATIVE_DAYS: Readonly<Record<Language, readonly [string, string, string]>> = {
  en: ["yesterday", "today", "tomorrow"],
  ru: ["вчера", "сегодня", "завтра"],
};

const MINUTES_PER_DAY = 24 * 60;

export type RelativeDayContext = {
  /** IANA zone whose calendar days decide "today". */
  readonly tz: string;
  readonly language: Language;
};

/**
`today` / `tomorrow` / `yesterday`, the weekday within the next six days, otherwise a
short date (with the year when it differs). Days are the zone's calendar days.
*/
export const formatRelativeDay = (
  atIso: string,
  nowIso: string,
  { language, tz: zone }: RelativeDayContext,
): string => {
  const days = Math.round(
    minutesBetween(startOfDayIn(nowIso, zone), startOfDayIn(atIso, zone)) / MINUTES_PER_DAY,
  );
  const named = RELATIVE_DAYS[language][days + 1];
  if (named !== undefined) {
    return named;
  }
  const date = new Date(atIso);
  if (days > 1 && days < 7) {
    return new Intl.DateTimeFormat(language, { timeZone: zone, weekday: "long" }).format(date);
  }
  const isSameYear =
    new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(date) ===
    new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(new Date(nowIso));
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: zone,
    ...(!isSameYear && { year: "numeric" }),
  }).format(date);
};
