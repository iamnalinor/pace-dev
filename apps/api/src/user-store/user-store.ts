import { DurableObject } from "cloudflare:workers";
import { and, asc, eq, gt, max } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import {
  autoOutcomeEvents,
  type Event,
  type EventInput,
  missingInstanceEvents,
  ok,
  parseEvent,
  type Result,
} from "@pace/core";

import type {
  ApplyError,
  ApplyMeta,
  ApplyResult,
  DryRunResult,
  JsonValue,
  Observation,
  ReadResult,
  StoredEvent,
} from "../shared/contract.ts";

import migrations from "../../drizzle/do/migrations.js";
import { coreValidator, type EventValidator, normalizeEvent } from "./event-log.ts";
import { rewriteProjections, updateProjections } from "./projections.ts";
import * as schema from "./schema.ts";
import {
  applyInOrder,
  canApplyInOrder,
  type Materialized,
  prepareBatch,
  rebuild,
  toRpcState,
  touchedBy,
} from "./state.ts";

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

/** System events are the server's own: this is their device. */
const SERVER_DEVICE_ID = "server";

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

/** A parsed event is JSON by construction, so the stored view is the same object. */
const toStored = (event: Event): StoredEvent => event;

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

/** Every event of the log as the core sees it; a row the schema no longer accepts is skipped. */
const loadLog = async (db: Db): Promise<readonly Event[]> => {
  const rows = await db.select().from(schema.events).orderBy(asc(schema.events.seq));
  return rows.flatMap((row) => {
    const parsed = parseEvent(toEvent(row));
    return parsed.ok ? [parsed.value] : [];
  });
};

/**
One instance per user (id = user id): the event log, the materialized state, the SQL
projections, decisions and alarms. Migrations run before the first request touches
storage. The state is cached in memory with the log sequence it was built at and
rebuilt when the cache is stale or a batch cannot be applied in order.
*/
export class UserStore extends DurableObject {
  #cache: Materialized | undefined;

  readonly db: Db;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { casing: "snake_case", schema });
    // eslint-disable-next-line sonarjs/no-async-constructor -- blockConcurrencyWhile is the documented way to migrate before the first request
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  async #system(inputs: readonly EventInput[], now: string): Promise<readonly Event[]> {
    const events = inputs.flatMap((input) => {
      const parsed = parseEvent({ ...input, deviceId: SERVER_DEVICE_ID, recordedAt: now });
      return parsed.ok ? [parsed.value] : [];
    });
    return await this.#insert(events);
  }

  /** The cached state, rebuilt from the log when the cache is missing or behind it. */
  async #current(): Promise<Materialized> {
    const seq = await latestSeq(this.db);
    if (this.#cache?.seq === seq) {
      return this.#cache;
    }
    const rebuilt = rebuild({ events: await loadLog(this.db), seq });
    await rewriteProjections(this.db, rebuilt.state);
    this.#cache = rebuilt;
    return rebuilt;
  }

  /** Inserts the events whose id is new to the log (and to this batch), in order. */
  async #insertNew(
    events: readonly Event[],
    known: ReadonlySet<string>,
  ): Promise<readonly Event[]> {
    const inserted: Event[] = [];
    for (const event of events) {
      if (known.has(event.id) || inserted.some((seen) => seen.id === event.id)) {
        continue;
      }
      await this.db
        .insert(schema.events)
        .values({ ...event, payload: JSON.stringify(event.payload) })
        .onConflictDoNothing({ target: schema.events.id });
      inserted.push(event);
    }
    return inserted;
  }

  /**
  The one write path: inserts what is new (known ids are skipped), then folds the new
  events into the cache and the projections, incrementally when the batch is in order
  and from scratch otherwise.
  */
  async #insert(events: readonly Event[]): Promise<readonly Event[]> {
    const before = await this.#current();
    const inserted = await this.#insertNew(events, before.ids);
    if (inserted.length === 0) {
      return inserted;
    }
    const seq = await latestSeq(this.db);
    if (canApplyInOrder(before, inserted)) {
      const next = applyInOrder(before, inserted, seq);
      await updateProjections(this.db, next.state, touchedBy(inserted));
      this.#cache = next;
    } else {
      this.#cache = undefined;
      await this.#current();
    }
    return inserted;
  }

  /** Smoke check used by tests: the schema is in place. */
  async countEvents(): Promise<number> {
    const rows = await this.db.select({ seq: schema.events.seq }).from(schema.events);
    return rows.length;
  }

  /**
  Appends events in the given order. Known ids are accepted again without a second
  copy (clients retry freely); an event the validator refuses is reported in
  `rejected` and the rest of the batch still goes in. The system events the new state
  calls for (instances, automatic outcomes) are derived right after.
  */
  async append(raw: readonly unknown[], options: AppendOptions): Promise<AppendResult> {
    const validateEvent = options.validateEvent ?? coreValidator;
    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    const events: Event[] = [];
    for (const item of raw) {
      const normalized = normalizeEvent(item, { now: options.now, validateEvent });
      // The validator seam may be wider than the core schema; storage never is.
      const parsed = normalized.ok ? parseEvent(normalized.value) : normalized;
      if (parsed.ok) {
        events.push(parsed.value);
        accepted.push(parsed.value.id);
      } else {
        rejected.push({ id: idOf(item), reason: parsed.error });
      }
    }
    await this.#insert(events);
    await this.derive(options.now);
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

  /** One event by id, corrections included; `undefined` when the log has no such id. */
  async find(id: string): Promise<StoredEvent | undefined> {
    const [row] = await this.db.select().from(schema.events).where(eq(schema.events.id, id));
    return row === undefined ? undefined : toEvent(row);
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

  /** The materialized state as of `now`, with the system events due by then derived first. */
  async read(now: string): Promise<ReadResult> {
    await this.derive(now);
    const current = await this.#current();
    return { state: toRpcState(current.state), seq: current.seq };
  }

  /**
  Writes a batch on behalf of an MCP or bot caller: validated against the current state
  in order (the first refusal stops everything, nothing is written), stamped with ids,
  `recordedAt` and the caller's device, appended, then derived.
  */
  async apply(
    inputs: readonly EventInput[],
    meta: ApplyMeta,
  ): Promise<Result<ApplyResult, ApplyError>> {
    const prepared = prepareBatch(await this.#current(), inputs, meta);
    if (!prepared.ok) {
      return prepared;
    }
    const inserted = await this.#insert(prepared.value.events);
    await this.derive(meta.now);
    const current = await this.#current();
    return ok({
      events: inserted.map((event) => toStored(event)),
      state: toRpcState(current.state),
      seq: current.seq,
    });
  }

  /** `apply` without the write: the would-be events and the state they would produce. */
  async dryRun(
    inputs: readonly EventInput[],
    meta: ApplyMeta,
  ): Promise<Result<DryRunResult, ApplyError>> {
    const prepared = prepareBatch(await this.#current(), inputs, meta);
    return prepared.ok
      ? ok({
          events: prepared.value.events.map((event) => toStored(event)),
          state: toRpcState(prepared.value.state),
        })
      : prepared;
  }

  /**
  Appends the system events the state calls for at `now`: the homework instances of
  the current week and the automatic outcomes whose deadline passed. Deterministic ids
  make this idempotent against clients that derived the same events. Returns their ids.
  */
  async derive(now: string): Promise<readonly string[]> {
    const before = await this.#current();
    const instances = await this.#system(missingInstanceEvents({ ...before.state, now }), now);
    const after = await this.#current();
    const outcomes = await this.#system(
      autoOutcomeEvents({ ...after.state, existingEventIds: after.ids, now }),
      now,
    );
    return [...instances, ...outcomes].map((event) => event.id);
  }
}
