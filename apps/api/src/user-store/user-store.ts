import { DurableObject } from "cloudflare:workers";
import { asc, eq, gt } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import {
  autoOutcomeEvents,
  type CoreState,
  type Event,
  type EventInput,
  missingInstanceEvents,
  notifyPlan,
  ok,
  parseEvent,
  type PlannedNotification,
  type Result,
  snooze,
} from "@pace/core";

import type {
  ApplyError,
  ApplyMeta,
  ApplyResult,
  DecisionEntry,
  DecisionQuery,
  DecisionRecord,
  DryRunResult,
  JsonValue,
  Observation,
  ReadResult,
  StoredEvent,
} from "../shared/contract.ts";
import type { TelegramTarget } from "../shared/telegram-api.ts";

import migrations from "../../drizzle/do/migrations.js";
import { insertDecisions, listDecisions } from "./decision-log.ts";
import { coreValidator, type EventValidator, normalizeEvent } from "./event-log.ts";
import { hasObservation, latestSeq, loadLog, toEvent } from "./log-queries.ts";
import {
  chatOf,
  memoryOf,
  type NotifyRun,
  rearm,
  runNotifier,
  saveMemory,
  SERVER_TZ,
  setChat,
  telegramOf,
} from "./notifier.ts";
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

/** A parsed event is JSON by construction, so the stored view is the same object. */
const toStored = (event: Event): StoredEvent => event;

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

  async #state(): Promise<CoreState> {
    const { state } = await this.#current();
    return state;
  }

  async #rearm(now: string): Promise<void> {
    await rearm(this.ctx.storage, await this.#state(), now);
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
    await this.#rearm(options.now);
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
  (derived first, so this week's instance can be addressed) in order (the first refusal
  stops everything, none of the batch is written), stamped with ids, `recordedAt` and the
  caller's device, appended, then derived again.
  */
  async apply(
    inputs: readonly EventInput[],
    meta: ApplyMeta,
  ): Promise<Result<ApplyResult, ApplyError>> {
    await this.derive(meta.now);
    const prepared = prepareBatch(await this.#current(), inputs, meta);
    if (!prepared.ok) {
      return prepared;
    }
    const inserted = await this.#insert(prepared.value.events);
    await this.derive(meta.now);
    await this.#rearm(meta.now);
    const current = await this.#current();
    return ok({
      events: inserted.map((event) => toStored(event)),
      state: toRpcState(current.state),
      seq: current.seq,
    });
  }

  /**
  `apply` without any write: the would-be events and the state they would produce. It does
  not derive either; callers that need this week's instances read first (as MCP does).
  */
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

  /** Keeps a small value until it is recalled (a bot preview waiting for its button). */
  async remember(key: string, value: JsonValue): Promise<void> {
    await this.ctx.storage.put(`memo:${key}`, value);
  }

  /** The remembered value, taken out: a second recall finds nothing. */
  async recall(key: string): Promise<JsonValue | undefined> {
    const value = await this.ctx.storage.get<JsonValue>(`memo:${key}`);
    await this.ctx.storage.delete(`memo:${key}`);
    return value;
  }

  /** Appends to the decision log (notifications here, parses from the routes and the bot). */
  async logDecisions(entries: readonly DecisionEntry[], now: string): Promise<void> {
    await insertDecisions(this.db, entries, now);
  }

  /** The decision log, newest first. */
  async decisions(query: DecisionQuery): Promise<readonly DecisionRecord[]> {
    return await listDecisions(this.db, query);
  }

  /** Notifications go to this chat from now on (the bot and every bot login call it). */
  async notifyTo(chatId: string, now: string): Promise<void> {
    await setChat(this.ctx.storage, chatId);
    await this.#rearm(now);
  }

  /** Silences a task's alerts until `until`. */
  async snoozeTask(taskId: string, until: string, now: string): Promise<void> {
    await saveMemory(this.ctx.storage, snooze(await memoryOf(this.ctx.storage), taskId, until));
    await this.#rearm(now);
  }

  /** What the phone should schedule locally for the next day. */
  async notifyPlan(now: string): Promise<readonly PlannedNotification[]> {
    await this.derive(now);
    const state = await this.#state();
    return notifyPlan(state, { deviceTz: SERVER_TZ, now }, await memoryOf(this.ctx.storage));
  }

  /** One pass of the notifier (see `runNotifier`); nothing happens until the chat is known. */
  async runNotifications(now: string, telegram: null | TelegramTarget): Promise<NotifyRun> {
    const chatId = await chatOf(this.ctx.storage);
    if (chatId === undefined) {
      return { decisions: 0, nextAt: null, sent: 0 };
    }
    await this.derive(now);
    return await runNotifier({
      chatId,
      log: async (decisions) => {
        await this.logDecisions(decisions, now);
      },
      now,
      state: await this.#state(),
      storage: this.ctx.storage,
      telegram,
    });
  }

  override async alarm(): Promise<void> {
    await this.runNotifications(new Date().toISOString(), telegramOf(this.env));
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
