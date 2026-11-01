import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import {
  addMinutesIso,
  type CoreState,
  err,
  type Event,
  type NewNotification,
  ok,
  type PoolNotification,
  poolPass,
  type PoolPass,
  type Resolution,
  type Result,
} from "@pace/core";

import type { NotifyError, ResolveError, ResolveMeta } from "../shared/contract.ts";
import type { PollEntry } from "../shared/push/poll-transport.ts";
import type * as schema from "./schema.ts";

import { createLogger } from "../shared/logger.ts";
import { pushConfigOf } from "../shared/push/registry.ts";
import * as cloud from "./cloud-data.ts";
import * as deliveries from "./delivery-rows.ts";
import { broadcast } from "./live-sockets.ts";
import {
  type Couriers,
  deliverNew,
  hasSendRetry,
  type PoolDeps,
  poolMemoryOf,
  type PoolNotifyOptions,
  ruledSeriesOf,
  savePoolMemory,
} from "./notification-pool.ts";
import * as notifier from "./notifier.ts";
import { answerInputs, answerRefusal, applyAnswer } from "./pool-answers.ts";
import { hasPendingAfterRetry } from "./pool-retries.ts";
import { armAfterWrite, armRetry, scheduleNextPass, takingPoolTime } from "./pool-retry-alarm.ts";
import * as rows from "./pool-rows.ts";
import { hasPendingAfterWithdraw } from "./pool-withdraw.ts";
import { type Materialized, prepareBatch } from "./state.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/**
The calendar a pass looks at around now: what started lately and what starts soon. The pool passes
at least daily (`scheduleNextPass`), so what lies ahead must stay longer than a day.
*/
const CALENDAR_BACK_MINUTES = 24 * 60;
const CALENDAR_AHEAD_MINUTES = 3 * 24 * 60;

/** What the pool needs from the user's store: its storage, its state and its one write path. */
export type PoolHost = {
  readonly db: Db;
  readonly ctx: DurableObjectState;
  readonly env: Cloudflare.Env;
  readonly deviceId: string;
  readonly current: () => Promise<Materialized>;
  readonly insert: (events: readonly Event[]) => Promise<readonly Event[]>;
  readonly derive: (now: string) => Promise<unknown>;
  readonly chatId: () => Promise<string | undefined>;
};

/**
What a pass of the pool added, and when the pool passes next as it now stands: the pass's own next
time or an earlier one a write asked for while it ran, within a day (`scheduleNextPass`).
*/
export type PoolRun = {
  readonly created: readonly PoolNotification[];
  readonly nextAt: string;
};

/** How an answer is given; `couriers` replaces the configured channels (tests). */
export type AnswerMeta = ResolveMeta & { readonly couriers?: Couriers | undefined };

/** A polling device's fetch, each `show` with the notification as it stands now. */
export type Polled = {
  readonly entries: readonly (PollEntry & { readonly notification?: null | PoolNotification })[];
  readonly cursor: number;
};

/**
The notification pool of one user's store: adding and delivering, answering, settling what
settled on its own, polling, and the alarm's passes.
*/
export class NotificationPool {
  readonly #host: PoolHost;

  constructor(host: PoolHost) {
    this.#host = host;
  }

  async #state(): Promise<CoreState> {
    const { state } = await this.#host.current();
    return state;
  }

  /** The channels the Worker is configured for, with this store's poll queue. */
  #couriers(override?: Couriers): Couriers {
    const { db, env } = this.#host;
    const poll = {
      enqueue: async (sessionId: string, entry: PollEntry) => {
        await deliveries.enqueuePoll(db, { entry, now: new Date().toISOString(), sessionId });
      },
    };
    return override === undefined
      ? { push: { ...pushConfigOf(env), poll }, telegram: notifier.telegramOf(env) }
      : { ...override, push: { poll, ...override.push } };
  }

  async #deps(now: string, couriers?: Couriers): Promise<PoolDeps> {
    const { ctx, db, env } = this.#host;
    const { settings } = await this.#state();
    return {
      binding: env.DB,
      chatId: await this.#host.chatId(),
      couriers: this.#couriers(couriers),
      ctx,
      db,
      now,
      settings,
      userId: ctx.id.name,
      webOrigin: notifier.webOriginOf(env),
    };
  }

  /** What the pool calls for at `now` (see `poolPass`); nothing is written. */
  async #pass(now: string): Promise<PoolPass> {
    const { ctx, db } = this.#host;
    const state = await this.#state();
    const open = await rows.openNotifications(db);
    const calendar = await cloud.listCalendar(db, {
      from: addMinutesIso(now, -CALENDAR_BACK_MINUTES),
      to: addMinutesIso(now, CALENDAR_AHEAD_MINUTES),
    });
    return poolPass({
      calendar,
      memory: await poolMemoryOf(ctx.storage),
      now,
      open: open.map(({ notification }) => notification),
      ruledSeries: await ruledSeriesOf(ctx.storage),
      state,
      zone: state.settings.timezone ?? notifier.SERVER_TZ,
    });
  }

  /**
  Resolves a notification and takes it back everywhere; one resolved already stays as it is.
  Answers whether a copy is still to take back (a pass retries it: `hasPendingAfterRetry`).
  */
  async #withdraw(id: string, resolution: Resolution, meta: AnswerMeta): Promise<boolean> {
    const { db } = this.#host;
    const stored = await rows.findNotification(db, id);
    return (
      stored !== undefined &&
      (await rows.didResolve(db, { id, now: meta.now, resolution })) &&
      (await hasPendingAfterWithdraw(await this.#deps(meta.now, meta.couriers), stored, {
        ...meta,
        resolution,
      }))
    );
  }

  /** `#withdraw`, then a pass a minute on when a copy is still to take back. */
  async #settle(id: string, resolution: Resolution, meta: AnswerMeta): Promise<void> {
    if (await this.#withdraw(id, resolution, meta)) {
      await armRetry(this.#host.ctx.storage, meta.now);
    }
  }

  /** Validates what the answer writes, then resolves it and writes it, in that order. */
  async #write(
    notification: PoolNotification,
    resolution: Resolution,
    meta: AnswerMeta,
  ): Promise<Result<null, ResolveError>> {
    const isBot = meta.origin === "telegram";
    await this.#host.derive(meta.now);
    const inputs = answerInputs(notification, resolution, {
      now: meta.now,
      state: await this.#state(),
    });
    const prepared = prepareBatch(await this.#host.current(), inputs, {
      deviceId: isBot ? "bot" : this.#host.deviceId,
      now: meta.now,
      source: isBot ? "bot" : meta.origin,
    });
    if (!prepared.ok) {
      return err({ code: prepared.error.code });
    }
    // Written first: an answer whose events did not go in leaves the notification open.
    await this.#host.insert(prepared.value.events);
    await applyAnswer(notification, resolution, this.#host);
    await this.#settle(notification.id, resolution, meta);
    await this.#host.derive(meta.now);
    await this.afterWrite(meta.now);
    return ok(null);
  }

  /** Adds and delivers (see `notify`); answers whether a copy failed and wants a retry. */
  async #add(
    created: NewNotification,
    now: string,
    options: PoolNotifyOptions,
  ): Promise<Result<{ notification: PoolNotification; isRetry: boolean }, NotifyError>> {
    const stored = await rows.insertNotification(this.#host.db, created, now);
    if (!stored.ok) {
      return stored;
    }
    await deliverNew(await this.#deps(now, options.couriers), stored.value, options);
    const isRetry = await hasSendRetry(await this.#deps(now, options.couriers), stored.value);
    return ok({ isRetry, notification: stored.value.notification });
  }

  /** The pass itself (see `run`). */
  async #run(now: string, couriers?: Couriers): Promise<PoolRun> {
    const { storage } = this.#host.ctx;
    await this.#host.derive(now);
    const pass = await this.#pass(now);
    const created: PoolNotification[] = [];
    // The pass asks for its retries once, at its end (`scheduleNextPass`): a time asked for on
    // the way would also stand after a pass that then breaks, ahead of its backoff.
    for (const item of pass.created) {
      const added = await this.#add(item, now, { couriers });
      if (added.ok) {
        created.push(added.value.notification);
      } else {
        createLogger("info").error("A notification broke its contract", { kind: item.kind });
      }
    }
    // Remembered once all of it is in the pool: a pass cut short is planned again next time, and
    // what it added already is found by its subject, not added or sent twice.
    await savePoolMemory(storage, pass.memory);
    for (const settled of pass.settled) {
      await this.#withdraw(settled.id, settled.resolution, { couriers, now, origin: "system" });
    }
    const isRetry = await hasPendingAfterRetry(await this.#deps(now, couriers));
    const nextAt = await scheduleNextPass(storage, { isRetry, nextAt: pass.nextAt, now });
    return { created, nextAt };
  }
  /**
  After a write: notifications it settled (an event attended from Now's offer, an activity
  stopped) are taken back at once everywhere, and the alarm moves earlier if the pool now has
  something due sooner (at once when something is due already, or when the pool has no time and
  the store no alarm at all: `armIfPoolUnplanned`).
  */
  async afterWrite(now: string): Promise<void> {
    const pass = await this.#pass(now);
    for (const settled of pass.settled) {
      await this.#settle(settled.id, settled.resolution, { now, origin: "system" });
    }
    const at = pass.created.length > 0 ? now : pass.nextAt;
    await armAfterWrite(this.#host.ctx.storage, { at, now });
  }

  /**
  Adds a notification to the pool and delivers it (see `deliverNew`, which may adopt a Telegram
  message); one about the same subject is delivered where it did not reach yet instead.
  */
  async notify(
    created: NewNotification,
    now: string,
    options: PoolNotifyOptions = {},
  ): Promise<Result<PoolNotification, NotifyError>> {
    const added = await this.#add(created, now, options);
    if (added.ok && added.value.isRetry) {
      await armRetry(this.#host.ctx.storage, now);
    }
    return added.ok ? ok(added.value.notification) : added;
  }

  /** What waits for a polling device; the cursor of the fetch before acknowledges what it got. */
  async poll(
    sessionId: string,
    window: { readonly after: number; readonly now: string },
  ): Promise<Polled> {
    const { db } = this.#host;
    const polled = await deliveries.takePoll(db, sessionId, window);
    const entries = [];
    for (const entry of polled.entries) {
      const found =
        entry.type === "show" ? await rows.findNotification(db, entry.notificationId) : undefined;
      entries.push(
        entry.type === "show" ? { ...entry, notification: found?.notification ?? null } : entry,
      );
    }
    return { cursor: polled.cursor, entries };
  }

  /** A page of the pool, newest first, with each notification's delivery log. */
  async list(query: Parameters<typeof rows.listNotifications>[1]): Promise<{
    readonly items: readonly PoolNotification[];
    readonly deliveries: Readonly<Record<string, readonly deliveries.DeliveryEntry[]>>;
    readonly more: boolean;
  }> {
    const { db } = this.#host;
    const page = await rows.listNotifications(db, query);
    const logs = await deliveries.deliveriesOf(
      db,
      page.items.map((item) => item.id),
    );
    return { ...page, deliveries: Object.fromEntries(logs) };
  }

  /** Marks notifications read; open clients update their badge. */
  async read(which: rows.ReadWhich, now: string): Promise<void> {
    await rows.markRead(this.#host.db, which, now);
    broadcast(this.#host.ctx, { type: "read" });
  }

  /**
  Answers a notification from any channel: writes what the answer means (Attend tracks the event
  as Now's offer does; "Yes, still" and Stop act on the activity), resolves it and takes it back
  everywhere (an answer from Telegram keeps its message, which the bot edits). One already
  resolved is answered as it stands, so a second tap anywhere changes nothing.
  */
  async answer(
    id: string,
    resolution: Resolution,
    meta: AnswerMeta,
  ): Promise<Result<PoolNotification, ResolveError>> {
    const { db } = this.#host;
    const found = await rows.findNotification(db, id);
    if (found?.notification.resolvedAt !== null) {
      return found === undefined ? err({ code: "notification/not-found" }) : ok(found.notification);
    }
    const refusal = answerRefusal(found.notification, resolution, meta.sessionId);
    if (refusal !== undefined) {
      return err({ code: refusal });
    }
    const written = await this.#write(found.notification, resolution, meta);
    if (!written.ok) {
      return written;
    }
    const resolved = await rows.findNotification(db, id);
    return ok(resolved?.notification ?? found.notification);
  }

  /**
  Skips one occurrence of a calendar event from anywhere (Now's offer on a phone, the web): it is
  never announced, and an announcement already out is resolved as skipped everywhere.
  */
  async skip(eventKey: string, meta: ResolveMeta): Promise<void> {
    const { ctx, db } = this.#host;
    const memory = await poolMemoryOf(ctx.storage);
    await savePoolMemory(ctx.storage, { ...memory, events: [...memory.events, eventKey] });
    const open = await rows.findOpenByRef(db, "event_start", eventKey);
    if (open !== undefined) {
      await this.#settle(open.notification.id, "skipped", meta);
    }
  }

  /**
  One pass of the pool (see `poolPass`): adds and delivers what is due, takes back what settled,
  and arms the alarm for the next pass (see `takingPoolTime`).
  */
  async run(now: string, couriers?: Couriers): Promise<PoolRun> {
    return await takingPoolTime(this.#host.ctx.storage, {
      now,
      pass: async () => await this.#run(now, couriers),
    });
  }
}
