import { DurableObject } from "cloudflare:workers";
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
  EventPage,
  JsonValue,
  Observation,
  ReadResult,
  Simulation,
  SimulationArgs,
  SqlError,
  SqlRows,
  StoredEvent,
  TableSchema,
} from "../shared/contract.ts";
import type { Cooldowns } from "../shared/llm/llm.ts";
import type { TelegramTarget } from "../shared/telegram-api.ts";

import migrations from "../../drizzle/do/migrations.js";
import { describeTables, runReadOnly, simulate } from "./analytics.ts";
import { insertDecisions, listDecisions } from "./decision-log.ts";
import {
  coreValidator,
  type EventValidator,
  screenBatch,
  type ScreenedBatch,
} from "./event-log.ts";
import {
  countEvents,
  findEvent,
  insertNew,
  insertObservations,
  latestSeq,
  listPage,
  loadLog,
  takeMemo,
} from "./log-queries.ts";
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
import {
  armForQueue,
  cooldownsOf,
  drainQueue,
  enqueue,
  noteLimits,
  type QueuedParse,
} from "./parse-queue.ts";
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
  readonly rejected: ScreenedBatch["rejected"];
  readonly seq: number;
};

/** System events are the server's own: this is their device. */
const SERVER_DEVICE_ID = "server";

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

  /**
  The one write path: inserts what is new (known ids are skipped), then folds the new
  events into the cache and the projections, incrementally when the batch is in order
  and from scratch otherwise.
  */
  async #insert(events: readonly Event[]): Promise<readonly Event[]> {
    const before = await this.#current();
    const inserted = await insertNew(this.db, events, before.ids);
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
    return await countEvents(this.db);
  }

  /**
  Appends events in the given order. Known ids are accepted again without a second
  copy (clients retry freely); an event the validator refuses is reported in
  `rejected` and the rest of the batch still goes in. The system events the new state
  calls for (instances, automatic outcomes) are derived right after.
  */
  async append(raw: readonly unknown[], options: AppendOptions): Promise<AppendResult> {
    const { accepted, events, rejected } = screenBatch(raw, {
      now: options.now,
      validateEvent: options.validateEvent ?? coreValidator,
    });
    await this.#insert(events);
    await this.derive(options.now);
    await this.#rearm(options.now);
    return { accepted, rejected, seq: await latestSeq(this.db) };
  }

  /** Events after `since` in sequence order; `seq` is the cursor for the next call. */
  async list(since: number, limit: number): Promise<EventPage> {
    return await listPage(this.db, since, limit);
  }

  /** One event by id, corrections included; `undefined` when the log has no such id. */
  async find(id: string): Promise<StoredEvent | undefined> {
    return await findEvent(this.db, id);
  }

  /** Append-only facts from the phone; a `kind+key` pair is stored once. Returns how many were new. */
  async appendObservations(observations: readonly Observation[]): Promise<number> {
    return await insertObservations(this.db, observations);
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
    return await takeMemo(this.ctx.storage, `memo:${key}`);
  }

  /** Appends to the decision log (notifications here, parses from the routes and the bot). */
  async logDecisions(entries: readonly DecisionEntry[], now: string): Promise<void> {
    await insertDecisions(this.db, entries, now);
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
    await this.#current();
    return runReadOnly(this.ctx.storage, sql);
  }

  /** The tables `querySql` can read and their CREATE statements. */
  async describeSchema(): Promise<readonly TableSchema[]> {
    await this.#current();
    return describeTables(this.ctx.storage);
  }

  /** Replays the notification rules over the log (see `simulate`); writes nothing. */
  async simulate(args: SimulationArgs): Promise<Simulation> {
    return simulate(await loadLog(this.db), args);
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
    const now = new Date().toISOString();
    await this.runNotifications(now, telegramOf(this.env));
    await this.drainParses(now);
  }

  /** The providers known to be rate limited at `now`, to skip until their time. */
  async llmCooldowns(now: string): Promise<Cooldowns> {
    return await cooldownsOf(this.ctx.storage, now);
  }

  /** Remembers the rate limits a parse ran into. */
  async noteLlmLimits(limited: Cooldowns, now: string): Promise<void> {
    await noteLimits(this.ctx.storage, limited, now);
  }

  /** Keeps a text to read once the assistant is back (`retryAt`, or the next chance). */
  async enqueueParse(
    item: Pick<QueuedParse, "channel" | "retryAt" | "text">,
    now: string,
  ): Promise<void> {
    await enqueue(this.ctx.storage, { ...item, enqueuedAt: now });
    await armForQueue(this.ctx.storage, now);
  }

  /**
  Reads the queued texts that are due, as the person asked: the reading is written (History
  can undo it) or the text goes to the Inbox; one still out of reach waits for the next try.
  */
  async drainParses(now: string): Promise<void> {
    await drainQueue({ env: this.env, now, storage: this.ctx.storage, store: this });
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
