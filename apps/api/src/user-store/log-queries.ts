import { and, asc, eq, gt, gte, lt, lte, max, min } from "drizzle-orm";

import { type Event, parseEvent, type SequencedCheckpointEvent } from "@pace/core";

import type { EventPage, JsonValue, StoredEvent } from "../shared/contract.ts";
import type { StoredSyncRecord } from "../shared/history-sync-types.ts";
import type { ActorStorage } from "../shared/ports/actor-storage.ts";
import type { SqliteDatabase } from "../shared/ports/sqlite.ts";

import * as schema from "./schema.ts";

type Db = SqliteDatabase<"sync", typeof schema>;

export const toEvent = (row: typeof schema.events.$inferSelect): StoredEvent => ({
  id: row.id,
  type: row.type,
  occurredAt: row.occurredAt,
  recordedAt: row.recordedAt,
  deviceId: row.deviceId,
  precision: row.precision as StoredEvent["precision"],
  source: row.source as StoredEvent["source"],
  payload: JSON.parse(row.payload) as JsonValue,
});

export const latestSeq = async (db: Db): Promise<number> => {
  const [row] = await db.select({ seq: max(schema.events.seq) }).from(schema.events);
  return row?.seq ?? 0;
};

/** Every event of the log as the core sees it; a row the schema no longer accepts is skipped. */
export const loadLog = async (db: Db, through?: number): Promise<readonly Event[]> => {
  const rows = await db
    .select()
    .from(schema.events)
    .where(through === undefined ? undefined : lte(schema.events.seq, through))
    .orderBy(asc(schema.events.seq));
  return rows.flatMap((row) => {
    const parsed = parseEvent(toEvent(row));
    return parsed.ok ? [parsed.value] : [];
  });
};

/** Inserts the events whose id is new to the log (and to this batch), in order. */
export const insertNew = async (
  db: Db,
  events: readonly Event[],
  known: ReadonlySet<string>,
): Promise<readonly Event[]> => {
  const inserted: Event[] = [];
  for (const event of events) {
    if (known.has(event.id) || inserted.some((seen) => seen.id === event.id)) {
      continue;
    }
    await db
      .insert(schema.events)
      .values({ ...event, payload: JSON.stringify(event.payload) })
      .onConflictDoNothing({ target: schema.events.id });
    inserted.push(event);
  }
  return inserted;
};

/** Events after `since` in sequence order; `seq` is the cursor for the next call. */
export const listPage = async (db: Db, since: number, limit: number): Promise<EventPage> => {
  const rows = await db
    .select()
    .from(schema.events)
    .where(gt(schema.events.seq, since))
    .orderBy(asc(schema.events.seq))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    events: page.map((row) => toEvent(row)),
    more: rows.length > limit,
    seq: last === undefined ? since : last.seq,
  };
};

/** Smoke check used by tests: how many events the log holds. */
export const countEvents = async (db: Db): Promise<number> => {
  const rows = await db.select({ seq: schema.events.seq }).from(schema.events);
  return rows.length;
};

/** One event by id, corrections included; `undefined` when the log has no such id. */
export const findEvent = async (db: Db, id: string): Promise<StoredEvent | undefined> => {
  const [row] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  return row === undefined ? undefined : toEvent(row);
};

/** A stored value, taken out: a second read finds nothing. */
export const takeMemo = async (
  storage: ActorStorage,
  key: string,
): Promise<JsonValue | undefined> => {
  const value = await storage.get<JsonValue>(key);
  await storage.delete(key);
  return value;
};

/** A complete delivery-cursor range; unknown raw rows must never silently disappear from a base. */
export const loadRecords = async (
  db: Db,
  after: number,
  through: number,
): Promise<{
  readonly records: readonly SequencedCheckpointEvent[];
  readonly complete: boolean;
}> => {
  const rows = await db
    .select()
    .from(schema.events)
    .where(and(gt(schema.events.seq, after), lte(schema.events.seq, through)))
    .orderBy(asc(schema.events.seq));
  const records = rows.flatMap((row) => {
    const parsed = parseEvent(toEvent(row));
    return parsed.ok ? { seq: row.seq, event: parsed.value } : [];
  });
  return { records, complete: records.length === rows.length };
};

/** Stop before the first recent arrival, retaining every later backdate in the cursor tail. */
export const checkpointPrefix = async (
  db: Db,
  cutoff: string,
  through: number,
): Promise<number> => {
  const [recent] = await db
    .select({ first: min(schema.events.seq) })
    .from(schema.events)
    .where(and(gte(schema.events.occurredAt, cutoff), lte(schema.events.seq, through)));
  const [prefix] = await db
    .select({ seq: max(schema.events.seq) })
    .from(schema.events)
    .where(
      and(
        lte(schema.events.seq, through),
        recent?.first === null || recent?.first === undefined
          ? undefined
          : lt(schema.events.seq, recent.first),
      ),
    );
  return prefix?.seq ?? 0;
};

/** Original SQLite cursors are transferred explicitly; AUTOINCREMENT can leave allocated gaps. */
export const storedPage = (
  storage: ActorStorage,
  input: { readonly after: number; readonly through: number; readonly limit: number },
): EventPage & {
  readonly records: readonly StoredSyncRecord[];
} => {
  const rows = storage.sql
    .exec<typeof schema.events.$inferSelect>(
      "SELECT seq,id,type,occurred_at AS occurredAt,recorded_at AS recordedAt,device_id AS deviceId,precision,source,payload FROM events WHERE seq > ? AND seq <= ? ORDER BY seq LIMIT ?",
      input.after,
      input.through,
      input.limit + 1,
    )
    .toArray();
  const page = rows.slice(0, input.limit);
  const records = page.map((row) => ({ seq: row.seq, event: toEvent(row) }));
  return {
    events: records.map((record) => record.event),
    records,
    more: rows.length > input.limit,
    seq: page.at(-1)?.seq ?? input.after,
  };
};
