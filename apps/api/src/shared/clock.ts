import type { Language } from "@pace/core";

/** `HH:MM` of `iso` on the wall clock of `zone`, as messages to the user show it. */
export const clockIn = (iso: string, language: Language, zone: string): string =>
  new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(iso));

/** `Fri 18:00` (`пт 18:00`): the weekday and wall clock of `iso` in `zone`. */
export const dayClockIn = (iso: string, language: Language, zone: string): string => {
  const weekday = new Intl.DateTimeFormat(language, { timeZone: zone, weekday: "short" }).format(
    new Date(iso),
  );
  return `${weekday} ${clockIn(iso, language, zone)}`;
};
