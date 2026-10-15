import type { NewNotification, PoolNotification, Resolution, Result } from "@pace/core";

import type { ResolveError, ResolveMeta } from "../shared/contract.ts";
import type { Couriers } from "./notification-pool.ts";
import type { AnswerMeta, NotificationPool, Polled } from "./pool-service.ts";

import { LiveStore } from "./live-sockets.ts";

/**
The notification pool's half of a user's store, as the Worker and the bot call it: each method
hands over to the store's `NotificationPool`.
*/
export abstract class PoolStore extends LiveStore {
  protected abstract get pool(): NotificationPool;

  /**
  Adds a notification to the pool and delivers it to every channel its kind is on for.
  `couriers` replaces the configured channels (tests).
  */
  async notify(
    created: NewNotification,
    now: string,
    couriers?: Couriers,
  ): ReturnType<NotificationPool["notify"]> {
    return await this.pool.notify(created, now, couriers);
  }

  /** What waits for a polling device (its session); the cursor acknowledges the fetch before. */
  async pollFor(
    sessionId: string,
    window: { readonly after: number; readonly now: string },
  ): Promise<Polled> {
    return await this.pool.poll(sessionId, window);
  }

  /** A page of the pool, newest first, with each notification's delivery log. */
  async listNotifications(
    query: Parameters<NotificationPool["list"]>[0],
  ): ReturnType<NotificationPool["list"]> {
    return await this.pool.list(query);
  }

  /** Marks notifications read; open clients update their badge. */
  async readNotifications(
    which: { readonly all: true } | { readonly ids: readonly string[] },
    now: string,
  ): Promise<void> {
    await this.pool.read(which, now);
  }

  /** Answers a notification from any channel (see `NotificationPool.answer`). */
  async resolveNotification(
    id: string,
    resolution: Resolution,
    meta: AnswerMeta,
  ): Promise<Result<PoolNotification, ResolveError>> {
    return await this.pool.answer(id, resolution, meta);
  }

  /** Skips one occurrence of a calendar event everywhere (see `NotificationPool.skip`). */
  async skipCalendarEvent(eventKey: string, meta: ResolveMeta): Promise<void> {
    await this.pool.skip(eventKey, meta);
  }

  /** One pass of the pool (see `NotificationPool.run`); `couriers` replaces the channels (tests). */
  async runNotifications(now: string, couriers?: Couriers): ReturnType<NotificationPool["run"]> {
    return await this.pool.run(now, couriers);
  }
}
