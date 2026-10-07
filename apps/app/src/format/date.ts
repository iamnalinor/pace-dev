import type { Language } from "@pace/core";

/** `Tue · Oct 6` / `вт · 6 окт.`: the mono eyebrow over a screen title, on the zone's calendar. */
export const eyebrowDate = (atIso: string, tz: string, language: Language): string => {
  const date = new Date(atIso);
  const weekday = new Intl.DateTimeFormat(language, { timeZone: tz, weekday: "short" }).format(
    date,
  );
  const day = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(date);
  return `${weekday} · ${day}`;
};
