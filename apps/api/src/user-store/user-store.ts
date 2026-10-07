import { DurableObject } from "cloudflare:workers";
import { and, asc, eq, gt, max } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import type { JsonValue, Observation, StoredEvent } from "../shared/contract.ts";

import migrations from "../../drizzle/do/migrations.js";
import { coreValidator, type EventValidator, normalizeEvent } from "./event-log.ts";
import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

export type AppendOptions = {
  readonly now: string;
  /** Only for in-process callers (tests); RPC callers get the core event schema. */
  readonly validateEvent?: EventValidator;
};

export type AppendResult = {
  readonly accepted: readonly string[];
  readonly rejected: readonly { readonly id: string; readonly reason: string }[];
  readonly seq: number;
};

export type ListResult = {
  readonly events: readonly StoredEvent[];
  readonly seq: number;
  readonly more: boolean;
};

const idOf = (raw: unknown): string =>
  typeof raw === "object" && raw !== null && "id" in raw ? String(raw.id) : "";

const toEvent = (row: typeof schema.events.$inferSelect): StoredEvent => ({
  id: row.id,
  type: row.type,
  occurredAt: row.occurredAt,
  recordedAt: row.recordedAt,
  deviceId: row.deviceId,
  precision: row.precision as StoredEvent["precision"],
  source: row.source as StoredEvent["source"],
  payload: JSON.parse(row.payload) as JsonValue,
});

const latestSeq = async (db: Db): Promise<number> => {
  const [row] = await db.select({ seq: max(schema.events.seq) }).from(schema.events);
  return row?.seq ?? 0;
};

const hasObservation = async (db: Db, observation: Observation): Promise<boolean> => {
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

/**
One instance per user (id = user id): the event log, projections, decisions and
alarms. Migrations run before the first request touches storage.
*/
export class UserStore extends DurableObject {
  readonly db: Db;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { casing: "snake_case", schema });
    // eslint-disable-next-line sonarjs/no-async-constructor -- blockConcurrencyWhile is the documented way to migrate before the first request
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  /** Smoke check used by tests: the schema is in place. */
  async countEvents(): Promise<number> {
    const rows = await this.db.select({ seq: schema.events.seq }).from(schema.events);
    return rows.length;
  }

  /**
  Appends events in the given order. Known ids are accepted again without a second
  copy (clients retry freely); an event the validator refuses is reported in
  `rejected` and the rest of the batch still goes in.
  */
  async append(raw: readonly unknown[], options: AppendOptions): Promise<AppendResult> {
    const validateEvent = options.validateEvent ?? coreValidator;
    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    for (const item of raw) {
      const normalized = normalizeEvent(item, { now: options.now, validateEvent });
      if (!normalized.ok) {
        rejected.push({ id: idOf(item), reason: normalized.error });
        continue;
      }
      const event = normalized.value;
      await this.db
        .insert(schema.events)
        .values({ ...event, payload: JSON.stringify(event.payload ?? null) })
        .onConflictDoNothing({ target: schema.events.id });
      accepted.push(event.id);
    }
    return { accepted, rejected, seq: await latestSeq(this.db) };
  }

  /** Events after `since` in sequence order; `seq` is the cursor for the next call. */
  async list(since: number, limit: number): Promise<ListResult> {
    const rows = await this.db
      .select()
      .from(schema.events)
      .where(gt(schema.events.seq, since))
      .orderBy(asc(schema.events.seq))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      events: page.map((row) => toEvent(row)),
      seq: last === undefined ? since : last.seq,
      more: rows.length > limit,
    };
  }

  /** Append-only facts from the phone; a `kind+key` pair is stored once. Returns how many were new. */
  async appendObservations(observations: readonly Observation[]): Promise<number> {
    let inserted = 0;
    for (const observation of observations) {
      if (await hasObservation(this.db, observation)) {
        continue;
      }
      await this.db
        .insert(schema.observations)
        .values({ ...observation, payload: JSON.stringify(observation.payload ?? null) });
      inserted += 1;
    }
    return inserted;
  }
}
