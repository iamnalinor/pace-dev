import type { Language } from "./language.ts";

import { formatCount, formatNumber } from "../format/numbers.ts";
import { addDaysIn, minutesBetween, startOfDayIn } from "../time.ts";
import { en } from "./en.ts";
import { pluralCategory } from "./plural-rules.ts";
import { ru } from "./ru.ts";

export { type Language, LANGUAGES } from "./language.ts";

export type MessageKey = keyof typeof en;

export type MessageParams = Readonly<Record<string, number | string>>;

const catalogs: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = { en, ru };

const interpolate = (text: string, params: MessageParams | undefined): string =>
  text.replaceAll(/\{(\w+)\}/g, (match, name: string) => {
    const value = params?.[name];
    return value === undefined ? match : String(value);
  });

/**
The platform's Russian region names spell «Соединенные Штаты» with е where the language writes ё
(QA round 15 L10); the one such name a sign-in is likely to come from.
*/
const withYo = (name: string): string => name.replaceAll("Соединенн", "Соединённ");

/**
A country's name in the reader's language, from the code Cloudflare reports (`DE`); the value as
it came when it names no region (Tor's "T1") or the platform cannot name regions (Hermes has no
`Intl.DisplayNames`). Settings' session list and the sign-in notice both name places this way.
*/
export const countryName = (code: string, language: Language): string => {
  if (typeof Intl.DisplayNames !== "function") {
    return code;
  }
  try {
    const name = new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code;
    return language === "ru" ? withYo(name) : name;
  } catch {
    return code;
  }
};

/**
`{count}` is the one parameter name for a number of things shown to the person: a numeric one is
written the way `formatCount` writes it (`1 284`), so no caller formats it by hand.
*/
const countGrouped = (language: Language, params: MessageParams | undefined) =>
  typeof params?.["count"] === "number"
    ? { ...params, count: formatCount(params["count"], language) }
    : params;

/**
Looks up `key` in the language's catalog and fills `{name}` placeholders. A key the catalog
lacks (only possible through a cast or an old client) reads as itself rather than taking the
screen down with it.
*/
export const t = (language: Language, key: MessageKey, params?: MessageParams): string =>
  interpolate(
    (catalogs[language] as Readonly<Partial<Record<string, string>>>)[key] ?? key,
    countGrouped(language, params),
  );

export type PluralForms = {
  readonly one: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
};

/** Chooses the CLDR plural form for `count` and fills `{count}` in it. */
export const plural = (language: Language, count: number, forms: PluralForms): string => {
  const category = pluralCategory(language, count);
  const shown = formatNumber(count, language);
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
      case "other": {
        return forms.other;
      }
    }
  };
  return interpolate(chosen(), { count: shown });
};

/**
Number and unit stay together on one line: the unit follows its number after U+00A0 (Russian
typesetting). The two pairs of a duration are joined by a plain space, so a long value can wrap
between «2 ч» and «05 мин» and never inside one.
*/
const NBSP = "\u{A0}";

const DURATION_UNITS: Readonly<
  Record<Language, { readonly d: string; readonly h: string; readonly m: string }>
> = {
  en: { d: "d", h: "h", m: "m" },
  ru: { d: `${NBSP}дн`, h: `${NBSP}ч`, m: `${NBSP}мин` },
};

/** Minutes after hours: `05` in Russian («2 ч 05 мин»), plain in English («2h 5m»). */
const minutesAfterHours = (minutes: number, language: Language): string =>
  language === "ru" ? String(minutes).padStart(2, "0") : String(minutes);

/** Hours roll into days once a duration reaches this many minutes. */
const DAYS_FROM = 48 * 60;

/**
Time left until a deadline, coarse: `1d 6h` from a day on, `5h 20m` under it, `0m` once
past. Whole days and hours only from a day on, where minutes are noise.
*/
export const formatLeft = (minutes: number, language: Language): string => {
  const total = Math.max(0, Math.floor(minutes));
  if (total < 24 * 60) {
    return formatDuration(total, language);
  }
  const units = DURATION_UNITS[language];
  const days = Math.floor(total / (24 * 60));
  const hours = Math.floor((total % (24 * 60)) / 60);
  return [`${days}${units.d}`, ...(hours > 0 ? [`${hours}${units.h}`] : [])].join(" ");
};

/**
`90` → `1h 30m` / `1 ч 30 мин`; `125` → `2h 5m` / `2 ч 05 мин`; `0` → `0m`. From 48 h on the
hours roll into days and the minutes drop: `3d 4h` / `3 дн 4 ч`, `7d` / `7 дн`.
*/
export const formatDuration = (minutes: number, language: Language): string => {
  const total = Math.round(minutes);
  if (total >= DAYS_FROM) {
    return formatLeft(total, language);
  }
  const units = DURATION_UNITS[language];
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts = [
    ...(hours > 0 ? [`${hours}${units.h}`] : []),
    ...(hours === 0 || rest > 0
      ? [`${hours > 0 ? minutesAfterHours(rest, language) : rest}${units.m}`]
      : []),
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
`today` / `tomorrow` / `yesterday`, otherwise the exact date ("Oct 13", "13 окт."; the year
is added when it differs). No weekday: the date says it all. Days are the zone's calendar days.
*/
export const formatRelativeDay = (
  atIso: string,
  nowIso: string,
  { language, tz: zone }: RelativeDayContext,
): string => {
  const days = Math.round(
    minutesBetween(startOfDayIn(nowIso, zone), startOfDayIn(atIso, zone)) / MINUTES_PER_DAY,
  );
  return (
    RELATIVE_DAYS[language][days + 1] ?? formatShortDate(atIso, nowIso, { language, tz: zone })
  );
};

/**
The date alone, as `formatRelativeDay` prints a day it does not name: "Oct 13", "13 окт.",
with the year when it is not the year of `nowIso`. Days are the zone's calendar days.
*/
export const formatShortDate = (
  atIso: string,
  nowIso: string,
  { language, tz: zone }: RelativeDayContext,
): string => {
  const date = new Date(atIso);
  const isSameYear =
    new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(date) ===
    new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(new Date(nowIso));
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: zone,
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
  ru: { d: `${NBSP}дн`, h: `${NBSP}ч`, m: `${NBSP}мин`, mo: `${NBSP}мес` },
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
  if (total < 60) {
    return `${total}${units.m}`;
  }
  const rest = total % 60;
  return rest === 0
    ? `${total / 60}${units.h}`
    : `${Math.floor(total / 60)}${units.h} ${minutesAfterHours(rest, language)}${units.m}`;
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
