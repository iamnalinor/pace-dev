import {
  accountTz,
  type ActivityCategory,
  addDaysIn,
  CATEGORY_COLORS,
  type CoreState,
  formatInZone,
  type ProjectColorName,
  type QueryContext,
  startOfWeekIn,
  timeline,
} from "@pace/core";

/** Where something sits in a day's column: minutes from the column's first hour, and its length. */
export type Placement = { readonly top: number; readonly height: number };

/** The hours a week column shows by default; earlier time widens it. */
const DEFAULT_FROM_HOUR = 7;
const HOURS_PER_DAY = 24;

export type WeekBlock = Placement & {
  readonly id: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color: ProjectColorName;
  readonly startAt: string;
  readonly endAt: string;
  readonly minutes: number;
  readonly isAlongside: boolean;
  /** The task the time was spent on, if any: the block's sheet opens it. */
  readonly taskId: null | string;
};

export type WeekDay = {
  /** Midnight of the day in the account zone. */
  readonly date: string;
  readonly isToday: boolean;
  readonly blocks: readonly WeekBlock[];
};

export type WeekModel = {
  readonly weekStart: string;
  /** The end of the week (the next Monday 00:00), for reading what devices sent. */
  readonly weekEnd: string;
  readonly zone: string;
  readonly previous: string;
  /** `null` for the current week. */
  readonly next: null | string;
  readonly days: readonly WeekDay[];
  /** The first hour the columns show (7 unless something started earlier). */
  readonly fromHour: number;
};

/** Minutes from `fromHour` of the day to the stretch, clipped to the day; `null` outside it. */
export const placeIn = (
  day: string,
  stretch: { readonly startAt: string; readonly endAt: string },
  { fromHour, zone }: { readonly fromHour: number; readonly zone: string },
): null | Placement => {
  const dayStart = Date.parse(day) + fromHour * 60 * 60_000;
  const dayEnd = Date.parse(addDaysIn(day, 1, zone));
  const start = Math.max(Date.parse(stretch.startAt), dayStart);
  const end = Math.min(Date.parse(stretch.endAt), dayEnd);
  return end > start ? { height: (end - start) / 60_000, top: (start - dayStart) / 60_000 } : null;
};

const hourOf = (at: string, zone: string): number => Number(formatInZone(at, zone, "H"));

/**
A week as lived: Monday to Sunday in the account zone, each day's tracked blocks (and what ran
alongside) placed on an hour grid. The calendar and the devices' usage are laid over it by the
screen, with `placeIn`.
*/
export const weekModel = (
  state: CoreState,
  weekOf: null | string,
  ctx: QueryContext,
): WeekModel => {
  const zone = accountTz(state, ctx);
  const thisWeek = startOfWeekIn(ctx.now, zone);
  const weekStart = weekOf === null ? thisWeek : startOfWeekIn(weekOf, zone);
  const dates = Array.from({ length: 7 }, (_, index) => addDaysIn(weekStart, index, zone));
  const lived = dates.map((date) => {
    const day = timeline(state.time, { from: date, now: ctx.now, to: addDaysIn(date, 1, zone) });
    return { date, segments: [...day.segments, ...day.alongside] };
  });
  const earliest = Math.min(
    DEFAULT_FROM_HOUR,
    ...lived.flatMap((day) => day.segments.map((segment) => hourOf(segment.startAt, zone))),
  );
  const today = formatInZone(ctx.now, zone, "yyyy-MM-dd");
  return {
    days: lived.map(({ date, segments }) => ({
      blocks: segments
        .map((segment) => ({
          place: placeIn(date, segment, { fromHour: earliest, zone }),
          segment,
        }))
        .filter(
          (entry): entry is { place: Placement; segment: (typeof segments)[number] } =>
            entry.place !== null,
        )
        .map(({ place, segment }) => ({
          ...place,
          category: segment.category,
          color: CATEGORY_COLORS[segment.category],
          endAt: segment.endAt,
          id: `${segment.activityId}-${segment.startAt}`,
          isAlongside: segment.isAlongside,
          label: segment.label,
          minutes: segment.minutes,
          startAt: segment.startAt,
          taskId: segment.taskId,
        })),
      date,
      isToday: formatInZone(date, zone, "yyyy-MM-dd") === today,
    })),
    fromHour: Math.max(0, Math.min(earliest, HOURS_PER_DAY - 1)),
    next: weekStart >= thisWeek ? null : addDaysIn(weekStart, 7, zone),
    previous: addDaysIn(weekStart, -7, zone),
    weekEnd: addDaysIn(weekStart, 7, zone),
    weekStart,
    zone,
  };
};
