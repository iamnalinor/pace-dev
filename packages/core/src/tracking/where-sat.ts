import type { UsageRow } from "../api/schemas/cloud.ts";

/** An app's time inside a block, on one device. */
export type SatRow = {
  readonly deviceName: string;
  readonly app: string;
  readonly minutes: number;
};

const MS_PER_MINUTE = 60_000;

/**
"Where I sat" during a block: each device's apps in front inside it, in whole minutes, the
largest first; less than a minute is left out. Only where the time went: nothing is judged.
*/
export const whereSat = (
  block: { readonly startAt: string; readonly endAt: string },
  usage: readonly UsageRow[],
): readonly SatRow[] => {
  const from = Date.parse(block.startAt);
  const until = Date.parse(block.endAt);
  const pieces = usage
    .map((session) => ({
      app: session.app,
      deviceName: session.deviceName,
      ms: Math.min(until, Date.parse(session.endAt)) - Math.max(from, Date.parse(session.startAt)),
    }))
    .filter((piece) => piece.ms > 0);
  const groups = Object.groupBy(pieces, (piece) => `${piece.deviceName}\0${piece.app}`);
  return Object.values(groups)
    .map((group = []) => ({
      app: group[0]?.app ?? "",
      deviceName: group[0]?.deviceName ?? "",
      minutes: Math.round(group.reduce((sum, piece) => sum + piece.ms, 0) / MS_PER_MINUTE),
    }))
    .filter((entry) => entry.minutes >= 1)
    .toSorted((a, b) => b.minutes - a.minutes);
};
