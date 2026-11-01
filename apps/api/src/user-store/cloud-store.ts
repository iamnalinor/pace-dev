import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import type { CalendarEvent, UsageRow } from "@pace/core";

import type * as schema from "./schema.ts";

import { createLogger } from "../shared/logger.ts";
import * as cloud from "./cloud-data.ts";
import { didSaveRuledSeries } from "./notification-pool.ts";
import { PoolStore } from "./pool-store.ts";

/**
What the person's devices send beside the event log, as a user's store keeps it: the phone's
calendar and each device's usage (names and times, never contents). A usage upload runs
automatic sleep on what is then known.
*/
export abstract class CloudStore extends PoolStore {
  abstract readonly db: DrizzleSqliteDODatabase<typeof schema>;

  /** One pass of automatic sleep at `now` (see `runSleepPass`), through the store's write path. */
  protected abstract sleepPass(now: string): Promise<readonly string[]>;

  /**
  A phone's calendar over a range, replacing what that phone sent for it before, with the series
  it answers "every time" for (never announced as they start). The pool looks again only when
  something changed: the same copy again (every background run sends it) loads no log.
  */
  async syncCalendar(upload: cloud.CalendarUpload, now: string): Promise<number> {
    const { isChanged, stored } = await cloud.replaceCalendar(this.db, upload);
    const isRuled =
      upload.ruledSeries !== undefined &&
      (await didSaveRuledSeries(this.ctx.storage, upload.ruledSeries));
    if (isChanged || isRuled) {
      await this.pool.afterWrite(now);
    }
    return stored;
  }

  /** The calendar's events overlapping a range. */
  async calendar(range: cloud.Range): Promise<readonly CalendarEvent[]> {
    return await cloud.listCalendar(this.db, range);
  }

  /** Forgets one phone's calendar copy (it stopped sending it). */
  async clearCalendar(deviceId: string): Promise<void> {
    await cloud.clearCalendar(this.db, deviceId);
  }

  /**
  A device's app sessions (names and times only), a phone's uses and how far it read. After a
  phone's upload (what bounds every decision) automatic sleep decides on what it now knows; a
  computer's use waits for that or for sleep's own alarm, so its 5-minute uploads read no log. A
  pass that fails is logged and left to the alarm: the upload is stored and answered all the same.
  */
  async addUsage(upload: cloud.UsageUpload, now: string): Promise<number> {
    const stored = await cloud.addUsage({ db: this.db, storage: this.ctx.storage }, upload, now);
    if (upload.isPhone) {
      try {
        await this.sleepPass(now);
      } catch (error) {
        createLogger("info").error("The sleep pass after an upload failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return stored;
  }

  /**
  Use on every device from `from` on, and how far the phones' usage is known at `now` (`null` when
  no phone uploaded within the day before): what automatic sleep decides on, at its own `now`.
  */
  async usageForSleep(from: string, now: string): Promise<cloud.SleepUsage> {
    return await cloud.usageForSleep({ db: this.db, storage: this.ctx.storage }, { from, now });
  }

  /** Each device that sent usage, with the end of its newest session. */
  async usageDevices(): Promise<ReturnType<typeof cloud.usageDevices>> {
    return await cloud.usageDevices(this.db);
  }

  /** App sessions on every device overlapping a range. */
  async usage(range: cloud.Range): Promise<readonly UsageRow[]> {
    return await cloud.listUsage(this.db, range);
  }
}
