import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import {
  err,
  type Event,
  type EventInput,
  ok,
  parseEvent,
  type Result,
  STORE_CHANGED,
} from "@pace/core";

import type {
  ApplyError,
  ApplyMeta,
  ApplyResult,
  DecisionEntry,
  DecisionQuery,
  DecisionRecord,
  DryRunResult,
  EventPage,
  JsonValue,
  ReadResult,
  Simulation,
  SimulationArgs,
  SqlError,
  SqlRows,
  StoredEvent,
  TableSchema,
} from "../shared/contract.ts";
import type { Cooldowns } from "../shared/llm/llm.ts";

import { versionOf } from "../shared/config.ts";
import { runEach } from "./alarm.ts";
import { describeTables, runReadOnly, simulate } from "./analytics.ts";
import { CloudStore } from "./cloud-store.ts";
import { insertDecisions, listDecisions, resolveDecisions } from "./decision-log.ts";
import { DERIVE_STEPS } from "./derive-steps.ts";
import * as eventLog from "./event-log.ts";
import { announceChange } from "./live-sockets.ts";
import * as log from "./log-queries.ts";
import * as notifier from "./notifier.ts";
import * as parseQueue from "./parse-queue.ts";
import { NotificationPool } from "./pool-service.ts";
import * as schema from "./schema.ts";
import { runSleepPass, sleepAtAlarm } from "./sleep-pass.ts";
import { StateCache } from "./state-cache.ts";
import { prepareBatch, toRpcState } from "./state.ts";
import { openStore, resetStore, SCHEMA_TAG, storeIdOf } from "./store-identity.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/** System events are the server's own: this is their device. */
const SERVER_DEVICE_ID = "server";

/** A parsed event is JSON by construction, so the stored view is the same object. */
const toStored = (event: Event): StoredEvent => event;

/**
One instance per user (id = user id): the event log, the materialized state, the SQL
projections, decisions and alarms. Before the first request touches storage, a store from
another epoch is emptied (see `STORE_EPOCH`) and migrations run. The state is cached in
memory with the log sequence it was built at and rebuilt when the cache is stale or a batch
cannot be applied in order (`StateCache`).
*/
export class UserStore extends CloudStore {
  readonly #state: StateCache;

  readonly #pool: NotificationPool;

  readonly db: Db;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { casing: "snake_case", schema });
    this.#state = new StateCache({
      build: `${versionOf(env.PACE_VERSION)}+${SCHEMA_TAG}`,
      db: this.db,
      storage: ctx.storage,
    });
    this.#pool = new NotificationPool({
      chatId: async () => await this.chatId(),
      ctx,
      current: async () => await this.#state.current(),
      db: this.db,
      derive: async (now) => await this.derive(now),
      deviceId: SERVER_DEVICE_ID,
      env,
      insert: async (events) => await this.#insert(events),
    });
    // eslint-disable-next-line sonarjs/no-async-constructor -- blockConcurrencyWhile is the documented way to migrate before the first request
    void ctx.blockConcurrencyWhile(async () => {
      await openStore(this.db, ctx.storage);
    });
  }

  /**
  The one write path: inserts what is new (known ids are skipped), then folds the new
  events into the cache and the projections, incrementally when the batch is in order
  and from scratch otherwise.
  */
  async #insert(events: readonly Event[]): Promise<readonly Event[]> {
    const before = await this.#state.current();
    const inserted = await log.insertNew(this.db, events, before.ids);
    if (inserted.length > 0) {
      const seq = await log.latestSeq(this.db);
      await announceChange(this.ctx, { inserted, seq, since: before.seq });
      await this.#state.fold(before, inserted, seq);
    }
    return inserted;
  }

  async #system(inputs: readonly EventInput[], now: string): Promise<readonly Event[]> {
    const events = inputs.flatMap((input) => {
      const parsed = parseEvent({ ...input, deviceId: SERVER_DEVICE_ID, recordedAt: now });
      return parsed.ok ? [parsed.value] : [];
    });
    return await this.#insert(events);
  }
  protected override get pool(): NotificationPool {
    return this.#pool;
  }

  /**
  Deletes the account's data: the event log, every projection, reminders and the alarm.
  The empty store migrates again under a new store id, so it serves the next login of the
  same person from scratch and a device still holding the old copy drops it.
  */
  async wipe(): Promise<void> {
    this.#state.forget();
    await resetStore(this.db, this.ctx.storage);
  }

  /** The store's id (see `storeIdOf`): it changes only when the store is wiped. */
  async storeId(): Promise<string> {
    return await storeIdOf(this.ctx.storage);
  }

  /** Smoke check used by tests: the schema is in place. */
  async countEvents(): Promise<number> {
    return await log.countEvents(this.db);
  }

  /**
  Appends events in the given order. Known ids are accepted again without a second
  copy (clients retry freely); an event the validator refuses is reported in
  `rejected` and the rest of the batch still goes in. The system events the new state
  calls for (instances, automatic outcomes) are derived right after.
  */
  async append(
    raw: readonly unknown[],
    options: eventLog.AppendOptions,
  ): Promise<eventLog.AppendResult> {
    const { accepted, events, rejected } = eventLog.screenBatch(raw, {
      now: options.now,
      validateEvent: options.validateEvent ?? eventLog.coreValidator,
    });
    await this.#insert(events);
    await this.derive(options.now);
    await this.#pool.afterWrite(options.now);
    return { accepted, rejected, seq: await log.latestSeq(this.db) };
  }

  /**
  A client's sync push: `append`, but only into the store the client's last pull confirmed.
  A batch meant for another store (one wiped since) is refused whole, in the same call that
  would write it, so an old outbox never lands in a fresh store.
  */
  async push(
    storeId: string,
    raw: readonly unknown[],
    options: eventLog.AppendOptions,
  ): Promise<Result<eventLog.AppendResult, typeof STORE_CHANGED>> {
    return storeId === (await storeIdOf(this.ctx.storage))
      ? ok(await this.append(raw, options))
      : err(STORE_CHANGED);
  }

  /**
  Events after `since` in sequence order; `seq` is the cursor for the next call. The store id
  comes in the same call, so a page and the id it belongs to can never come from two stores.
  */
  async list(since: number, limit: number): Promise<EventPage & { readonly storeId: string }> {
    return {
      ...(await log.listPage(this.db, since, limit)),
      storeId: await storeIdOf(this.ctx.storage),
    };
  }

  /** One event by id, corrections included; `undefined` when the log has no such id. */
  async find(id: string): Promise<StoredEvent | undefined> {
    return await log.findEvent(this.db, id);
  }

  /** The materialized state as of `now`, with the system events due by then derived first. */
  async read(now: string): Promise<ReadResult> {
    await this.derive(now);
    const current = await this.#state.current();
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
    const prepared = prepareBatch(await this.#state.current(), inputs, meta);
    if (!prepared.ok) {
      return prepared;
    }
    const inserted = await this.#insert(prepared.value.events);
    await this.derive(meta.now);
    await this.#pool.afterWrite(meta.now);
    const current = await this.#state.current();
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
    const prepared = prepareBatch(await this.#state.current(), inputs, meta);
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
    return await log.takeMemo(this.ctx.storage, `memo:${key}`);
  }

  /** Reads a pending bot action without consuming its approval button. */
  async peek(key: string): Promise<JsonValue | undefined> {
    return await this.ctx.storage.get<JsonValue>(`memo:${key}`);
  }

  /** One pass of automatic sleep (see `runSleepPass`); its events go through the system path. */
  protected override async sleepPass(now: string): Promise<readonly string[]> {
    return await runSleepPass(
      {
        insert: async (inputs, at) => {
          const made = await this.#system(inputs, at);
          if (made.length > 0) {
            await this.derive(at);
            await this.#pool.afterWrite(at);
          }
          return made;
        },
        log: async () => await log.loadLog(this.db),
        seq: async () => await log.latestSeq(this.db),
        logDecisions: async (entries, at) => {
          await this.logDecisions(entries, at);
        },
        storage: this.ctx.storage,
        usageForSleep: async (from, at) => await this.usageForSleep(from, at),
        zone: async () => await this.#state.zone(),
      },
      now,
    );
  }

  /** Appends to the decision log (notifications here, parses from the routes and the bot). */
  async logDecisions(entries: readonly DecisionEntry[], now: string): Promise<void> {
    await insertDecisions(this.db, entries, now);
  }

  async resolveDecisions(answers: Parameters<typeof resolveDecisions>[1]): Promise<number> {
    return await resolveDecisions(this.db, answers);
  }

  /** The decision log, newest first. */
  async decisions(query: DecisionQuery): Promise<readonly DecisionRecord[]> {
    return await listDecisions(this.db, query);
  }

  /**
  One read-only query over the store's tables (projections current first): a single SELECT,
  run in a transaction that always rolls back.
  */
  async querySql(sql: string): Promise<Result<SqlRows, SqlError>> {
    await this.#state.current();
    return runReadOnly(this.ctx.storage, sql);
  }

  /** The tables `querySql` can read and their CREATE statements. */
  async describeSchema(): Promise<readonly TableSchema[]> {
    await this.#state.current();
    return describeTables(this.ctx.storage);
  }

  /** Replays the notification rules over the log (see `simulate`); writes nothing. */
  async simulate(args: SimulationArgs): Promise<Simulation> {
    return simulate(await log.loadLog(this.db), args);
  }

  /** Notifications go to this chat from now on (the bot and every bot login call it). */
  async notifyTo(chatId: string, now: string): Promise<void> {
    await notifier.setChat(this.ctx.storage, chatId);
    await this.#pool.afterWrite(now);
  }

  /** The user's Telegram chat (see `chatFor`); the store's name is the user id. */
  async chatId(): Promise<string | undefined> {
    return await notifier.chatFor(this.ctx.storage, this.env.DB, this.ctx.id.name);
  }

  /**
  Everything the store waits on, each arming its own next time again through `armEarliest`: the
  notification pool, the assistant's queue, automatic sleep.
  */
  override async alarm(): Promise<void> {
    const now = new Date().toISOString();
    await runEach([
      async () => await this.runNotifications(now),
      async () => {
        await this.drainParses(now);
      },
      async () => {
        await sleepAtAlarm(this.ctx.storage, { now, pass: async () => await this.sleepPass(now) });
      },
    ]);
  }

  /** The providers known to be rate limited at `now`, to skip until their time. */
  async llmCooldowns(now: string): Promise<Cooldowns> {
    return await parseQueue.cooldownsOf(this.ctx.storage, now);
  }

  /** Remembers the rate limits a parse ran into. */
  async noteLlmLimits(limited: Cooldowns, now: string): Promise<void> {
    await parseQueue.noteLimits(this.ctx.storage, limited, now);
  }

  /** Keeps a text to read once the assistant is back (`retryAt`, or the next chance). */
  async enqueueParse(
    item: Pick<parseQueue.QueuedParse, "channel" | "domain" | "retryAt" | "text">,
    now: string,
  ): Promise<void> {
    await parseQueue.enqueue(this.ctx.storage, { ...item, enqueuedAt: now });
    await parseQueue.armForQueue(this.ctx.storage, now);
  }

  /**
  Reads the queued texts that are due, as the person asked: the reading is written (History
  can undo it) or the text goes to the Inbox; one still out of reach waits for the next try.
  */
  async drainParses(now: string): Promise<void> {
    await parseQueue.drainQueue({ env: this.env, now, storage: this.ctx.storage, store: this });
  }

  /**
  Appends the system events the state calls for at `now` (see `DERIVE_STEPS`). Deterministic ids
  make this idempotent against clients that derived the same events. Returns their ids.
  */
  async derive(now: string): Promise<readonly string[]> {
    const made: string[] = [];
    for (const step of DERIVE_STEPS) {
      const current = await this.#state.current();
      const events = step({ ...current.state, existingEventIds: current.ids, now });
      const appended = await this.#system(events, now);
      made.push(...appended.map((event) => event.id));
    }
    return made;
  }
}
