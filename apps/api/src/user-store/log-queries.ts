import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { and, asc, eq, max } from "drizzle-orm";

import { type Event, parseEvent } from "@pace/core";

import type { JsonValue, Observation, StoredEvent } from "../shared/contract.ts";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

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

export const hasObservation = async (db: Db, observation: Observation): Promise<boolean> => {
  const [existing] = await db
    .select({ seq: schema.observations.seq })
    .from(schema.observations)
    .where(
      and(
        eq(schema.observations.kind, observation.kind),
        eq(schema.observations.key, observation.key),
      ),
    )
    .limit(1);
  return existing !== undefined;
};

/** Every event of the log as the core sees it; a row the schema no longer accepts is skipped. */
export const loadLog = async (db: Db): Promise<readonly Event[]> => {
  const rows = await db.select().from(schema.events).orderBy(asc(schema.events.seq));
  return rows.flatMap((row) => {
    const parsed = parseEvent(toEvent(row));
    return parsed.ok ? [parsed.value] : [];
  });
};
