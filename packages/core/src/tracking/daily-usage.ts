import type { Interval } from "./phone-use.ts";

import { InstantSchema, TimeZoneSchema } from "../events/payloads.ts";
import { err, ok, type Result } from "../result.ts";
import { formatInZone, nextDayStartIn, startOfDayIn } from "../time.ts";

export type DailyUsagePiece = {
  readonly day: string;
  readonly from: string;
  readonly to: string;
  readonly milliseconds: number;
};

export type DailyUsageError = "usage/invalid-interval" | "usage/invalid-zone";

const piecesFrom = (
  cursor: number,
  end: number,
  zone: string,
): Result<readonly DailyUsagePiece[], DailyUsageError> => {
  if (cursor === end) {
    return ok([]);
  }
  const from = new Date(cursor).toISOString();
  const boundary = Date.parse(nextDayStartIn(from, zone));
  if (boundary <= cursor) {
    return err("usage/invalid-interval");
  }
  if (end <= boundary) {
    return ok([
      {
        day: formatInZone(from, zone, "yyyy-MM-dd"),
        from,
        to: new Date(end).toISOString(),
        milliseconds: end - cursor,
      },
    ]);
  }
  // Divide at a local boundary so recursion depth grows logarithmically with the day count.
  const midpoint = Date.parse(
    startOfDayIn(new Date(cursor + (end - cursor) / 2).toISOString(), zone),
  );
  const split = Math.max(boundary, midpoint);
  const left = piecesFrom(cursor, split, zone);
  if (!left.ok) {
    return left;
  }
  const right = piecesFrom(split, end, zone);
  return right.ok ? ok([...left.value, ...right.value]) : right;
};

/** Split a half-open source interval at local calendar boundaries without rounding. */
export const splitDailyUsage = (
  interval: Interval,
  zone: string,
): Result<readonly DailyUsagePiece[], DailyUsageError> => {
  if (!TimeZoneSchema.safeParse(zone).success) {
    return err("usage/invalid-zone");
  }
  if (
    !InstantSchema.safeParse(interval.startAt).success ||
    !InstantSchema.safeParse(interval.endAt).success
  ) {
    return err("usage/invalid-interval");
  }
  const start = Date.parse(interval.startAt);
  const end = Date.parse(interval.endAt);
  return end < start ? err("usage/invalid-interval") : piecesFrom(start, end, zone);
};
