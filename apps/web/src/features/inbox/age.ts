import type { Translate } from "#web/i18n.tsx";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** The artboard's compact age: `12m`, `5h`, `2d` (whole units, rounded down). */
export const formatAge = (minutes: number, t: Translate): string => {
  if (minutes < MINUTES_PER_HOUR) {
    return t("inbox.age.minutes", { count: Math.max(0, Math.floor(minutes)) });
  }
  if (minutes < MINUTES_PER_DAY) {
    return t("inbox.age.hours", { count: Math.floor(minutes / MINUTES_PER_HOUR) });
  }
  return t("inbox.age.days", { count: Math.floor(minutes / MINUTES_PER_DAY) });
};
