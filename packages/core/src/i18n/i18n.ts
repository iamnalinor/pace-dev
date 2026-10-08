import { addDaysIn, minutesBetween, startOfDayIn } from "../time.ts";
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
`today` / `tomorrow` / `yesterday`, otherwise the exact date with its weekday ("Tue Oct 13",
"вт 13 окт."; the year is added when it differs). Never a bare weekday: "Tuesday" a week
away is ambiguous. Days are the zone's calendar days.
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
  const isSameYear =
    new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(date) ===
    new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(new Date(nowIso));
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: zone,
    weekday: "short",
    ...(!isSameYear && { year: "numeric" }),
  })
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => part.value)
    .join(" ");
};

const SPAN_UNITS: Readonly<
  Record<
    Language,
    { readonly mo: string; readonly d: string; readonly h: string; readonly m: string }
  >
> = {
  en: { d: "d", h: "h", m: "m", mo: "mo" },
  ru: { d: " д", h: " ч", m: " м", mo: " мес" },
};

const DAYS_PER_MONTH = 30;

type SpanUnit = readonly [amount: number, unit: string];

/** `6d 12h`, or `6d` when the smaller unit is zero. */
const spanPair = ([big, bigUnit]: SpanUnit, [small, smallUnit]: SpanUnit): string =>
  small > 0 ? `${big}${bigUnit} ${small}${smallUnit}` : `${big}${bigUnit}`;

/**
A span of time, rounded down, in at most two units: over a month → months and days, over a
week → days, over a day → days and hours, over an hour → hours and minutes, else minutes.
`9390` → `6d 12h`; the sign is ignored (callers say "left" or "late").
*/
export const formatSpan = (minutes: number, language: Language): string => {
  const total = Math.floor(Math.abs(minutes));
  const units = SPAN_UNITS[language];
  const days = Math.floor(total / MINUTES_PER_DAY);
  if (days >= DAYS_PER_MONTH) {
    return spanPair(
      [Math.floor(days / DAYS_PER_MONTH), units.mo],
      [days % DAYS_PER_MONTH, units.d],
    );
  }
  if (days >= 7) {
    return `${days}${units.d}`;
  }
  if (days >= 1) {
    return spanPair([days, units.d], [Math.floor((total % MINUTES_PER_DAY) / 60), units.h]);
  }
  return total >= 60
    ? spanPair([Math.floor(total / 60), units.h], [total % 60, units.m])
    : `${total}${units.m}`;
};

/**
How late a task is: whole hours from an hour on (`2h`, `1d 3h`); minutes only while a hard
deadline is under an hour late. A soft deadline (resubmission) never counts minutes: `<1h`.
*/
export const formatLate = (minutes: number, language: Language, isSoft: boolean): string => {
  const total = Math.floor(Math.abs(minutes));
  if (total >= 60) {
    return formatSpan(total - (total % 60), language);
  }
  return isSoft ? `<1${SPAN_UNITS[language].h}` : formatSpan(total, language);
};

const dateParts = (
  atIso: string,
  language: Language,
  options: Intl.DateTimeFormatOptions & { readonly timeZone: string },
): Readonly<Partial<Record<Intl.DateTimeFormatPartTypes, string>>> =>
  Object.fromEntries(
    new Intl.DateTimeFormat(language, options)
      .formatToParts(new Date(atIso))
      .map((part) => [part.type, part.value]),
  );

/** `Thursday · Oct 8` / `четверг · 8 окт.`: the eyebrow over a page title, on the zone's calendar. */
export const formatEyebrow = (atIso: string, zone: string, language: Language): string => {
  const parts = dateParts(atIso, language, {
    day: "numeric",
    month: "short",
    timeZone: zone,
    weekday: "long",
  });
  const day = language === "ru" ? `${parts.day} ${parts.month}` : `${parts.month} ${parts.day}`;
  return `${parts.weekday} · ${day}`;
};

/** `Oct 5 – 11`, `Sep 28 – Oct 4` / `5 – 11 окт.`: the seven days from `weekStartIso`. */
export const formatWeekRange = (weekStartIso: string, zone: string, language: Language): string => {
  const options = { day: "numeric", month: "short", timeZone: zone } as const;
  const first = dateParts(weekStartIso, language, options);
  const last = dateParts(addDaysIn(weekStartIso, 6, zone), language, options);
  const isSameMonth = first.month === last.month;
  if (language === "ru") {
    return isSameMonth
      ? `${first.day} – ${last.day} ${last.month}`
      : `${first.day} ${first.month} – ${last.day} ${last.month}`;
  }
  return isSameMonth
    ? `${first.month} ${first.day} – ${last.day}`
    : `${first.month} ${first.day} – ${last.month} ${last.day}`;
};
