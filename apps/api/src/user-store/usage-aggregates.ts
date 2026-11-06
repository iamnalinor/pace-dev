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
type Piece = { readonly start: number; readonly end: number };
export type AggregateContext = {
  readonly storeId: string;
  readonly zone: string;
  readonly now: string;
};

const dayStart = (day: string, zone: string): string =>
  startOfDayIn(wallClockInstant(day, "12:00", zone), zone);

const normalized = (span: Span): Span | undefined => {
  const start = Date.parse(span.startAt);
  const end = Date.parse(span.endAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() }
    : undefined;
};
export const closedUsageDays = (
  spans: readonly Span[],
  context: AggregateContext,
): readonly string[] => {
  const cutoff = Date.parse(startOfDayIn(context.now, context.zone));
  const days = spans.flatMap((span) => {
    const valid = normalized(span);
    if (valid === undefined) {
      return [];
    }
    const pieces = splitDailyUsage(valid, context.zone);
    return pieces.ok
      ? pieces.value.filter((piece) => Date.parse(piece.to) <= cutoff).map((piece) => piece.day)
      : [];
  });
  return [...new Set(days)].toSorted((left, right) => left.localeCompare(right));
};
const clipped = <T extends Span>(rows: readonly T[], from: string, to: string) =>
  rows
    .map((row) => ({
      row,
      start: Math.max(Date.parse(row.startAt), Date.parse(from)),
      end: Math.min(Date.parse(row.endAt), Date.parse(to)),
    }))
    .filter((piece) => piece.end > piece.start)
    .toSorted((a, b) => a.start - b.start);
const milliseconds = (pieces: readonly Piece[]): number => {
  let end = -Infinity;
  let total = 0;
  const ordered = pieces.toSorted((a, b) => a.start - b.start);
  for (const piece of ordered) {
    total += Math.max(0, piece.end - Math.max(end, piece.start));
    end = Math.max(end, piece.end);
  }
  return total;
};

const dailySources = (storage: ActorStorage, from: string, to: string) => ({
  usage: storage.sql
    .exec<Usage>(
      "SELECT device_id AS deviceId,device_name AS deviceName,app,start_at AS startAt,end_at AS endAt FROM usage_sessions WHERE julianday(end_at)>julianday(?) AND julianday(start_at)<julianday(?)",
      from,
      to,
    )
    .toArray(),
  phones: storage.sql
    .exec<Phone>(
      "SELECT device_id AS deviceId,start_at AS startAt,end_at AS endAt FROM phone_uses WHERE julianday(end_at)>julianday(?) AND julianday(start_at)<julianday(?)",
      from,
      to,
    )
    .toArray(),
});

const appFacts = (pieces: ReturnType<typeof clipped<Usage>>) => {
  const firstAt = new Date(Math.min(...pieces.map((piece) => piece.start))).toISOString();
  const lastAt = new Date(Math.max(...pieces.map((piece) => piece.end))).toISOString();
  const names = [...new Set(pieces.map((piece) => piece.row.deviceName))].toSorted((left, right) =>
    left.localeCompare(right),
  );
  return { firstAt, lastAt, names: JSON.stringify(names), milliseconds: milliseconds(pieces) };
};

const writeApps = (
  storage: ActorStorage,
  context: AggregateContext & { readonly day: string },
  pieces: ReturnType<typeof clipped<Usage>>,
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
  context: AggregateContext & { readonly day: string },
  pieces: ReturnType<typeof clipped<Usage>>,
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

/** Replaces exact union totals from authoritative rows; never adds upload durations. */
export const rebuildUsageDay = (
  storage: ActorStorage,
  context: AggregateContext & { readonly day: string },
): void => {
  const from = dayStart(context.day, context.zone);
  const to = nextDayStartIn(from, context.zone);
  const source = dailySources(storage, from, to);
  const pieces = clipped(source.usage, from, to);
  for (const table of ["usage_daily_apps", "usage_daily_devices", "_history_phone_daily"]) {
    storage.sql.exec(
      `DELETE FROM ${table} WHERE store_id=? AND zone=? AND day=?`,
      context.storeId,
      context.zone,
      context.day,
    );
  }
  writeApps(storage, context, pieces);
  writeDevices(storage, context, pieces);
  const phones = clipped(source.phones, from, to);
  const phoneGroups = Map.groupBy(phones, (piece) => piece.row.deviceId);
  for (const [deviceId, own] of phoneGroups) {
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

export const ensureUsageAggregates = (storage: ActorStorage, context: AggregateContext): void => {
  const today = formatInZone(context.now, context.zone, "yyyy-MM-dd");
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
  const cursor = storage.sql.exec<{ startAt: string; endAt: string }>(
    "SELECT start_at AS startAt,end_at AS endAt FROM usage_sessions WHERE julianday(end_at)>julianday(?) UNION ALL SELECT start_at AS startAt,end_at AS endAt FROM phone_uses WHERE julianday(end_at)>julianday(?)",
    after,
    after,
  );
  const spans = Iterator.from(cursor)
    .map((span) => ({
      ...span,
      startAt: Date.parse(span.startAt) < Date.parse(after) ? after : span.startAt,
    }))
    .toArray();
  if (mark?.zone !== context.zone) {
    for (const table of ["usage_daily_apps", "usage_daily_devices", "_history_phone_daily"]) {
      storage.sql.exec(`DELETE FROM ${table} WHERE store_id=?`, context.storeId);
    }
  }
  for (const day of closedUsageDays(spans, context)) {
    rebuildUsageDay(storage, { ...context, day });
  }
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
  for (const day of closedUsageDays(spans, context)) {
    rebuildUsageDay(storage, { ...context, day });
  }
};
