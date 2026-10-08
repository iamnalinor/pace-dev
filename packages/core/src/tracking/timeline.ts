import type { Activity, ActivityCategory, TimeState } from "./model.ts";

/** Unaccounted time shorter than this is not worth a "log what happened" card. */
export const GAP_MINUTES = 15;

const MS_PER_MINUTE = 60_000;

/** One stretch of the timeline: an activity clipped to the range and to what overrides it. */
export type Segment = {
  readonly activityId: string;
  readonly label: string;
  readonly category: ActivityCategory;
  readonly taskId: null | string;
  readonly startAt: string;
  readonly endAt: string;
  readonly minutes: number;
  readonly isRunning: boolean;
  readonly isLogged: boolean;
  /** The activity's Expect, when it has one. */
  readonly expectMinutes: null | number;
  readonly messengersOnPurpose: boolean;
};

export type Gap = { readonly startAt: string; readonly endAt: string; readonly minutes: number };

export type Timeline = {
  readonly segments: readonly Segment[];
  readonly gaps: readonly Gap[];
  /** Minutes per category, only those with any time. */
  readonly totals: Readonly<Partial<Record<ActivityCategory, number>>>;
  readonly trackedMinutes: number;
  /** The live activity running at `now`, when it falls inside the range. */
  readonly running: null | Segment;
};

export type Range = { readonly from: string; readonly to: string; readonly now: string };

type Piece = { readonly activity: Activity; readonly start: number; readonly end: number };

const toIso = (ms: number): string => new Date(ms).toISOString();

/** Total minutes of a list of rows. */
export const sumMinutes = (rows: readonly { readonly minutes: number }[]): number =>
  rows.reduce((sum, row) => sum + row.minutes, 0);

type Window = { readonly from: number; readonly until: number; readonly now: number };

const clip = (activity: Activity, { from, now, until }: Window): null | Piece => {
  const start = Math.max(Date.parse(activity.startAt), from);
  const end = Math.min(activity.endAt === null ? now : Date.parse(activity.endAt), until);
  return end > start ? { activity, end, start } : null;
};

/** Among pieces of one kind a later start wins: the earlier one ends where the next begins. */
const trimOverlaps = (pieces: readonly Piece[]): readonly Piece[] => {
  const sorted = pieces.toSorted((a, b) =>
    a.start === b.start ? a.end - b.end : a.start - b.start,
  );
  return sorted
    .map((piece, index) => {
      const next = sorted[index + 1];
      return next !== undefined && next.start < piece.end ? { ...piece, end: next.start } : piece;
    })
    .filter((piece) => piece.end > piece.start);
};

const cutOne = (piece: Piece, cut: Piece): readonly Piece[] =>
  cut.end <= piece.start || cut.start >= piece.end
    ? [piece]
    : [
        ...(cut.start > piece.start ? [{ ...piece, end: cut.start }] : []),
        ...(cut.end < piece.end ? [{ ...piece, start: cut.end }] : []),
      ];

/** A live piece minus every logged block over it (a logged block may split it in two). */
const subtract = (piece: Piece, cuts: readonly Piece[]): readonly Piece[] =>
  // eslint-disable-next-line unicorn/no-array-reduce -- each block cuts what the previous ones left
  cuts.reduce<readonly Piece[]>(
    (pieces, cut) => pieces.flatMap((current) => cutOne(current, cut)),
    [piece],
  );

const toSegment = (piece: Piece, now: number): Segment => ({
  activityId: piece.activity.id,
  category: piece.activity.category,
  endAt: toIso(piece.end),
  expectMinutes: piece.activity.expectMinutes,
  isLogged: piece.activity.isLogged,
  isRunning: !piece.activity.isLogged && piece.activity.endAt === null && piece.end === now,
  label: piece.activity.label,
  messengersOnPurpose: piece.activity.messengersOnPurpose,
  minutes: Math.round((piece.end - piece.start) / MS_PER_MINUTE),
  startAt: toIso(piece.start),
  taskId: piece.activity.taskId,
});

const gapsBetween = (pieces: readonly Piece[], from: number, until: number): readonly Gap[] => {
  const bounds = [{ end: from, start: from }, ...pieces, { end: until, start: until }];
  return bounds
    .slice(1)
    .map((piece, index) => {
      const previousEnd = bounds[index]?.end ?? from;
      return {
        endAt: toIso(piece.start),
        minutes: Math.floor((piece.start - previousEnd) / MS_PER_MINUTE),
        startAt: toIso(previousEnd),
      };
    })
    .filter((gap) => gap.minutes >= GAP_MINUTES);
};

/**
The time between `from` and `to` as non-overlapping segments. Live activities follow each
other (a start closes the previous one; a later start wins an overlap left by an adjustment);
logged blocks win over the live time they cover and may split it. Nothing exists after `now`.
*/
export const timeline = (time: TimeState, { from, now, to }: Range): Timeline => {
  const fromMs = Date.parse(from);
  const nowMs = Date.parse(now);
  const untilMs = Math.min(Date.parse(to), nowMs);
  const clipped = Object.values(time.activities).flatMap((activity) => {
    const piece = clip(activity, { from: fromMs, now: nowMs, until: untilMs });
    return piece === null ? [] : [piece];
  });
  const logged = trimOverlaps(clipped.filter((piece) => piece.activity.isLogged));
  const live = trimOverlaps(clipped.filter((piece) => !piece.activity.isLogged)).flatMap((piece) =>
    subtract(piece, logged),
  );
  const pieces = [...live, ...logged].toSorted((a, b) => a.start - b.start);
  const segments = pieces.map((piece) => toSegment(piece, nowMs));
  const totals: Partial<Record<ActivityCategory, number>> = Object.fromEntries(
    Object.entries(Object.groupBy(segments, (segment) => segment.category)).map(
      ([category, group]) => [category, sumMinutes(group)],
    ),
  );
  return {
    gaps: gapsBetween(pieces, fromMs, untilMs),
    running: segments.find((segment) => segment.isRunning) ?? null,
    segments,
    totals,
    trackedMinutes: sumMinutes(segments),
  };
};

/** The live activity running now (whatever the day), or null. */
export const runningActivity = (time: TimeState, now: string): Activity | null =>
  Object.values(time.activities)
    .filter((activity) => !activity.isLogged && activity.endAt === null && activity.startAt <= now)
    .toSorted((a, b) => b.startAt.localeCompare(a.startAt))
    .at(0) ?? null;
