import {
  formatInZone,
  nextDayStartIn,
  splitDailyUsage,
  startOfDayIn,
  wallClockInstant,
} from "@pace/core";

import type { ActorStorage } from "../shared/ports/actor-storage.ts";

type Span = { readonly startAt: string; readonly endAt: string };
type Usage = Span & {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly app: string;
};
type Phone = Span & { readonly deviceId: string };
/** The part of a source row that falls in one local day, as instants. */
type Piece<T> = { readonly row: T; readonly start: number; readonly end: number };
export type AggregateContext = {
  readonly storeId: string;
  readonly zone: string;
  readonly now: string;
};
type DayContext = AggregateContext & { readonly day: string };

const DERIVED_TABLES = ["usage_daily_apps", "usage_daily_devices", "_history_phone_daily"];

const dayStart = (day: string, zone: string): string =>
  startOfDayIn(wallClockInstant(day, "12:00", zone), zone);

const todayOf = (context: AggregateContext): string =>
  formatInZone(context.now, context.zone, "yyyy-MM-dd");

/**
Each row cut at the local day boundaries, from `from` on, grouped by day: one pass over the rows,
whatever the number of days they cover. A row with no valid interval is left out.
*/
const piecesByDay = <T extends Span>(
  rows: readonly T[],
  zone: string,
  from: number,
): ReadonlyMap<string, readonly Piece<T>[]> => {
  const days = new Map<string, Piece<T>[]>();
  for (const row of rows) {
    const start = Math.max(Date.parse(row.startAt), from);
    const end = Date.parse(row.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    const interval = { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
    const split = splitDailyUsage(interval, zone);
    const pieces = split.ok ? split.value : [];
    for (const piece of pieces) {
      const own = days.get(piece.day) ?? [];
      own.push({ row, start: Date.parse(piece.from), end: Date.parse(piece.to) });
      days.set(piece.day, own);
    }
  }
  return days;
};

const milliseconds = (pieces: readonly Piece<unknown>[]): number => {
  let end = -Infinity;
  let total = 0;
  const ordered = pieces.toSorted((a, b) => a.start - b.start);
  for (const piece of ordered) {
    total += Math.max(0, piece.end - Math.max(end, piece.start));
    end = Math.max(end, piece.end);
  }
  return total;
};

/** The source rows that end after `from` (and start before `to`, when given). */
const sourcesFrom = (storage: ActorStorage, from: string, to: string | undefined) => {
  const until = to === undefined ? "" : " AND julianday(start_at)<julianday(?)";
  const args = to === undefined ? [from] : [from, to];
  return {
    usage: storage.sql
      .exec<Usage>(
        `SELECT device_id AS deviceId,device_name AS deviceName,app,start_at AS startAt,end_at AS endAt FROM usage_sessions WHERE julianday(end_at)>julianday(?)${until}`,
        ...args,
      )
      .toArray(),
    phones: storage.sql
      .exec<Phone>(
        `SELECT device_id AS deviceId,start_at AS startAt,end_at AS endAt FROM phone_uses WHERE julianday(end_at)>julianday(?)${until}`,
        ...args,
      )
      .toArray(),
  };
};

const appFacts = (pieces: readonly Piece<Usage>[]) => {
  const firstAt = new Date(Math.min(...pieces.map((piece) => piece.start))).toISOString();
  const lastAt = new Date(Math.max(...pieces.map((piece) => piece.end))).toISOString();
  const names = [...new Set(pieces.map((piece) => piece.row.deviceName))].toSorted((left, right) =>
    left.localeCompare(right),
  );
  return { firstAt, lastAt, names: JSON.stringify(names), milliseconds: milliseconds(pieces) };
};

const writeApps = (
  storage: ActorStorage,
  context: DayContext,
  pieces: readonly Piece<Usage>[],
): void => {
  const groups = Map.groupBy(pieces, (piece) =>
    JSON.stringify([piece.row.deviceId, piece.row.app]),
  );
  for (const own of groups.values()) {
    const first = own[0];
    if (first === undefined) {
      continue;
    }
    const facts = appFacts(own);
    storage.sql.exec(
      "INSERT INTO usage_daily_apps (store_id,zone,day,device_id,app,milliseconds,first_at,last_at,device_names) VALUES (?,?,?,?,?,?,?,?,?)",
      context.storeId,
      context.zone,
      context.day,
      first.row.deviceId,
      first.row.app,
      facts.milliseconds,
      facts.firstAt,
      facts.lastAt,
      facts.names,
    );
  }
};
const writeDevices = (
  storage: ActorStorage,
  context: DayContext,
  pieces: readonly Piece<Usage>[],
): void => {
  const groups = Map.groupBy(pieces, (piece) => piece.row.deviceId);
  for (const [deviceId, own] of groups) {
    storage.sql.exec(
      "INSERT INTO usage_daily_devices (store_id,zone,day,device_id,device_name,milliseconds) VALUES (?,?,?,?,?,?)",
      context.storeId,
      context.zone,
      context.day,
      deviceId,
      own[0]?.row.deviceName ?? deviceId,
      milliseconds(own),
    );
  }
};
const writePhones = (
  storage: ActorStorage,
  context: DayContext,
  pieces: readonly Piece<Phone>[],
): void => {
  const groups = Map.groupBy(pieces, (piece) => piece.row.deviceId);
  for (const [deviceId, own] of groups) {
    storage.sql.exec(
      "INSERT INTO _history_phone_daily (store_id,zone,day,device_id,milliseconds) VALUES (?,?,?,?,?)",
      context.storeId,
      context.zone,
      context.day,
      deviceId,
      milliseconds(own),
    );
  }
};

/**
Replaces the exact union totals of closed days (before today) from the authoritative rows that end
after `from` (and start before `to`), read once; only `days` when given, else every day they cover.
Never adds upload durations.
*/
const rebuildUsageDays = (
  storage: ActorStorage,
  context: AggregateContext,
  range: { readonly from: string; readonly to?: string; readonly days?: ReadonlySet<string> },
): void => {
  const today = todayOf(context);
  const from = Date.parse(range.from);
  const source = sourcesFrom(storage, range.from, range.to);
  const usage = piecesByDay(source.usage, context.zone, from);
  const phones = piecesByDay(source.phones, context.zone, from);
  const days = range.days ?? new Set([...usage.keys(), ...phones.keys()]);
  for (const day of days) {
    if (day >= today) {
      continue;
    }
    const own = { ...context, day };
    for (const table of DERIVED_TABLES) {
      storage.sql.exec(
        `DELETE FROM ${table} WHERE store_id=? AND zone=? AND day=?`,
        own.storeId,
        own.zone,
        day,
      );
    }
    writeApps(storage, own, usage.get(day) ?? []);
    writeDevices(storage, own, usage.get(day) ?? []);
    writePhones(storage, own, phones.get(day) ?? []);
  }
};

/** Brings the totals up to yesterday in the current zone: from the last mark, or all of them anew. */
export const ensureUsageAggregates = (storage: ActorStorage, context: AggregateContext): void => {
  const today = todayOf(context);
  const [mark] = storage.sql
    .exec<{ zone: string; through_day: string }>(
      "SELECT zone,through_day FROM _history_usage_state WHERE id=1",
    )
    .toArray();
  if (mark?.zone === context.zone && mark.through_day === today) {
    return;
  }
  const after =
    mark?.zone === context.zone
      ? dayStart(mark.through_day, context.zone)
      : "0001-01-01T00:00:00.000Z";
  if (mark?.zone !== context.zone) {
    for (const table of DERIVED_TABLES) {
      storage.sql.exec(`DELETE FROM ${table} WHERE store_id=?`, context.storeId);
    }
  }
  rebuildUsageDays(storage, context, { from: after });
  storage.sql.exec(
    "INSERT INTO _history_usage_state (id,zone,through_day) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET zone=excluded.zone,through_day=excluded.through_day",
    context.zone,
    today,
  );
};

/** Called only after an actual source-row change, within that source write's transaction. */
export const updateUsageAggregates = (
  storage: ActorStorage,
  context: AggregateContext,
  spans: readonly Span[],
): void => {
  ensureUsageAggregates(storage, context);
  const days = new Set(piecesByDay(spans, context.zone, -Infinity).keys());
  const ordered = [...days].toSorted((left, right) => left.localeCompare(right));
  const first = ordered.at(0);
  const last = ordered.at(-1);
  if (first === undefined || last === undefined) {
    return;
  }
  rebuildUsageDays(storage, context, {
    from: dayStart(first, context.zone),
    to: nextDayStartIn(dayStart(last, context.zone), context.zone),
    days,
  });
};
