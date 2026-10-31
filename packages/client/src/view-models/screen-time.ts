import { addDaysIn, startOfDayIn, type UsageRow } from "@pace/core";

type Span = { readonly startAt: string; readonly endAt: string };

type Piece = {
  readonly app: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly start: number;
  readonly end: number;
};

export type AppTime = {
  readonly app: string;
  readonly deviceIds: readonly string[];
  readonly deviceNames: readonly string[];
  readonly firstAt: string;
  readonly lastAt: string;
  readonly minutes: number;
};

export type DeviceTime = {
  readonly id: string;
  readonly name: string;
  readonly minutes: number;
};

export type ScreenTime = {
  readonly from: string;
  readonly to: string;
  readonly totalMinutes: number;
  readonly devices: readonly DeviceTime[];
  readonly apps: readonly AppTime[];
};

const MINUTE_MS = 60_000;

/** Only the part of each foreground session inside the requested half-open span. */
const clipped = (usage: readonly UsageRow[], span: Span): readonly Piece[] => {
  const from = Date.parse(span.startAt);
  const to = Date.parse(span.endAt);
  return usage
    .map((row) => ({
      app: row.app,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      start: Math.max(from, Date.parse(row.startAt)),
      end: Math.min(to, Date.parse(row.endAt)),
    }))
    .filter((piece) => piece.end > piece.start);
};

/** Union intervals on one device, so an upload overlap never counts twice. */
const elapsed = (pieces: readonly Piece[]): number => {
  const ordered = pieces.toSorted((a, b) => a.start - b.start);
  const walk = (index: number, end: number, ms: number): number => {
    const piece = ordered[index];
    return piece === undefined
      ? ms
      : walk(
          index + 1,
          Math.max(end, piece.end),
          ms + Math.max(0, piece.end - Math.max(piece.start, end)),
        );
  };
  return walk(0, -Infinity, 0);
};

const minutes = (ms: number): number => Math.round(ms / MINUTE_MS);

const byMinutes = <T extends { readonly minutes: number }>(a: T, b: T): number =>
  b.minutes - a.minutes;

/** App totals across devices, with each device's duplicate intervals merged first. */
const appRows = (pieces: readonly Piece[]): readonly AppTime[] =>
  Object.entries(Object.groupBy(pieces, (piece) => piece.app))
    .map(([app, rows]): AppTime | null => {
      if (rows === undefined || rows.length === 0) {
        return null;
      }
      const devices = Object.entries(Object.groupBy(rows, (row) => row.deviceId));
      const total = devices.reduce((sum, [, own = []]) => sum + elapsed(own), 0);
      return {
        app,
        deviceIds: devices.map(([id]) => id).toSorted((a, b) => a.localeCompare(b)),
        deviceNames: [...new Set(rows.map((row) => row.deviceName))].toSorted((a, b) =>
          a.localeCompare(b),
        ),
        firstAt: new Date(Math.min(...rows.map((row) => row.start))).toISOString(),
        lastAt: new Date(Math.max(...rows.map((row) => row.end))).toISOString(),
        minutes: minutes(total),
      };
    })
    .filter((row): row is AppTime => row !== null && row.minutes > 0)
    .toSorted((a, b) => (byMinutes(a, b) === 0 ? a.app.localeCompare(b.app) : byMinutes(a, b)));

/** Apps actually in the activity's span, sorted by foreground time. */
export const appsDuring = (usage: readonly UsageRow[], span: Span): readonly AppTime[] =>
  appRows(clipped(usage, span));

/** One account-local day, with device time deduplicated across its apps. */
export const screenTime = (usage: readonly UsageRow[], day: string, zone: string): ScreenTime => {
  const from = startOfDayIn(day, zone);
  const to = addDaysIn(from, 1, zone);
  const pieces = clipped(usage, { startAt: from, endAt: to });
  const devices = Object.entries(Object.groupBy(pieces, (piece) => piece.deviceId))
    .map(([id, rows]): DeviceTime | null =>
      rows === undefined || rows.length === 0
        ? null
        : {
            id,
            name: rows[0]?.deviceName ?? id,
            minutes: minutes(elapsed(rows)),
          },
    )
    .filter((row): row is DeviceTime => row !== null && row.minutes > 0)
    .toSorted((a, b) => (byMinutes(a, b) === 0 ? a.name.localeCompare(b.name) : byMinutes(a, b)));
  return {
    from,
    to,
    totalMinutes: devices.reduce((sum, device) => sum + device.minutes, 0),
    devices,
    apps: appRows(pieces),
  };
};
