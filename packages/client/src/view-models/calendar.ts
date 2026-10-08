/** A day cell of a month view: its date, the number shown, and whether it is in that month. */
export type CalendarDay = {
  readonly date: string;
  readonly day: number;
  readonly isInMonth: boolean;
};

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

const pad = (value: number): string => String(value).padStart(2, "0");

const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const monthStart = (month: string): number => {
  const [year = 1970, number = 1] = month.split("-").map(Number);
  return Date.UTC(year, number - 1, 1);
};

/** `2026-10-08` → `2026-10`. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** The month `step` months away: `2026-12` + 1 → `2027-01`. */
export const shiftMonth = (month: string, step: number): string => {
  const start = new Date(monthStart(month));
  const shifted = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + step, 1));
  return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}`;
};

/**
A month (`YYYY-MM`) as whole weeks from Monday to Sunday, the first and last padded with the
neighbouring months' days: four to six rows.
*/
export const monthGrid = (month: string): readonly (readonly CalendarDay[])[] => {
  const first = monthStart(month);
  const next = monthStart(shiftMonth(month, 1));
  // getUTCDay: Sunday is 0; Monday-first weeks count it as the 7th day.
  const lead = (new Date(first).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  const shown = Math.ceil((lead + (next - first) / MS_PER_DAY) / DAYS_PER_WEEK) * DAYS_PER_WEEK;
  const days = Array.from({ length: shown }, (_, index): CalendarDay => {
    const at = first + (index - lead) * MS_PER_DAY;
    return {
      date: isoDate(at),
      day: new Date(at).getUTCDate(),
      isInMonth: at >= first && at < next,
    };
  });
  return Array.from({ length: shown / DAYS_PER_WEEK }, (_, week) =>
    days.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
};
