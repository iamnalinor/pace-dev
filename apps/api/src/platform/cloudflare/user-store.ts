import { DurableObject } from "cloudflare:workers";

import { actorCalls } from "../../shared/ports/actor-call.ts";
import { UserStore as StoreService } from "../../user-store/user-store.ts";
import { actorDatabase, migrateActor } from "./actor-storage.ts";
import { cloudflareBindings } from "./bindings.ts";
import { actorContext } from "./live-channel.ts";

/** Cloudflare RPC hosting only. Domain calls within the service do not re-enter the queue. */
export class UserStore extends DurableObject {
  readonly #queue = actorCalls();
  readonly #run = async <T>(operation: () => T): Promise<Awaited<T>> =>
    await this.#queue(async () => {
      await this.service.ready;
      await this.service.assertAvailable();
      return await operation();
    });

  readonly service: StoreService;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.service = new StoreService(actorContext(ctx), cloudflareBindings(env), {
      db: actorDatabase(ctx.storage),
      migrate: async () => {
        await migrateActor(ctx.storage);
      },
    });
  }

  async beginCleanup(
    ...args: Parameters<StoreService["beginCleanup"]>
  ): ReturnType<StoreService["beginCleanup"]> {
    return await this.#queue(async () => {
      await this.service.ready;
      return await this.service.beginCleanup(...args);
    });
  }
  async resetForCleanup(
    ...args: Parameters<StoreService["resetForCleanup"]>
  ): ReturnType<StoreService["resetForCleanup"]> {
    return await this.#queue(async () => {
      await this.service.ready;
      return await this.service.resetForCleanup(...args);
    });
  }
  async finishCleanup(
    ...args: Parameters<StoreService["finishCleanup"]>
  ): ReturnType<StoreService["finishCleanup"]> {
    return await this.#queue(async () => {
      await this.service.ready;
      return await this.service.finishCleanup(...args);
    });
  }
  async archiveHistory(
    ...args: Parameters<StoreService["archiveHistory"]>
  ): ReturnType<StoreService["archiveHistory"]> {
    await this.#run(async () => {
      await this.service.archiveHistory(...args);
    });
  }

  async wipe(...args: Parameters<StoreService["wipe"]>): ReturnType<StoreService["wipe"]> {
    await this.#run(async () => {
      await this.service.wipe(...args);
    });
  }

  async storeId(...args: Parameters<StoreService["storeId"]>): ReturnType<StoreService["storeId"]> {
    return await this.#run(async () => await this.service.storeId(...args));
  }

  async countEvents(
    ...args: Parameters<StoreService["countEvents"]>
  ): ReturnType<StoreService["countEvents"]> {
    return await this.#run(async () => await this.service.countEvents(...args));
  }

  async append(...args: Parameters<StoreService["append"]>): ReturnType<StoreService["append"]> {
    return await this.#run(async () => await this.service.append(...args));
  }

  async push(...args: Parameters<StoreService["push"]>): ReturnType<StoreService["push"]> {
    return await this.#run(async () => await this.service.push(...args));
  }

  async bootstrap(
    ...args: Parameters<StoreService["bootstrap"]>
  ): ReturnType<StoreService["bootstrap"]> {
    return await this.#run(async () => await this.service.bootstrap(...args));
  }
  async pull(...args: Parameters<StoreService["pull"]>): ReturnType<StoreService["pull"]> {
    return await this.#run(async () => await this.service.pull(...args));
  }

  async list(...args: Parameters<StoreService["list"]>): ReturnType<StoreService["list"]> {
    return await this.#run(async () => await this.service.list(...args));
  }

  async find(...args: Parameters<StoreService["find"]>): ReturnType<StoreService["find"]> {
    return await this.#run(async () => await this.service.find(...args));
  }

  async read(...args: Parameters<StoreService["read"]>): ReturnType<StoreService["read"]> {
    return await this.#run(async () => await this.service.read(...args));
  }

  async apply(...args: Parameters<StoreService["apply"]>): ReturnType<StoreService["apply"]> {
    return await this.#run(async () => await this.service.apply(...args));
  }

  async dryRun(...args: Parameters<StoreService["dryRun"]>): ReturnType<StoreService["dryRun"]> {
    return await this.#run(async () => await this.service.dryRun(...args));
  }

  async remember(
    ...args: Parameters<StoreService["remember"]>
  ): ReturnType<StoreService["remember"]> {
    await this.#run(async () => {
      await this.service.remember(...args);
    });
  }

  async recall(...args: Parameters<StoreService["recall"]>): ReturnType<StoreService["recall"]> {
    return await this.#run(async () => await this.service.recall(...args));
  }

  async peek(...args: Parameters<StoreService["peek"]>): ReturnType<StoreService["peek"]> {
    return await this.#run(async () => await this.service.peek(...args));
  }

  async logDecisions(
    ...args: Parameters<StoreService["logDecisions"]>
  ): ReturnType<StoreService["logDecisions"]> {
    await this.#run(async () => {
      await this.service.logDecisions(...args);
    });
  }

  async resolveDecisions(
    ...args: Parameters<StoreService["resolveDecisions"]>
  ): ReturnType<StoreService["resolveDecisions"]> {
    return await this.#run(async () => await this.service.resolveDecisions(...args));
  }

  async decisions(
    ...args: Parameters<StoreService["decisions"]>
  ): ReturnType<StoreService["decisions"]> {
    return await this.#run(async () => await this.service.decisions(...args));
  }

  async querySql(
    ...args: Parameters<StoreService["querySql"]>
  ): ReturnType<StoreService["querySql"]> {
    return await this.#run(async () => await this.service.querySql(...args));
  }

  async describeSchema(
    ...args: Parameters<StoreService["describeSchema"]>
  ): ReturnType<StoreService["describeSchema"]> {
    return await this.#run(async () => await this.service.describeSchema(...args));
  }

  async simulate(
    ...args: Parameters<StoreService["simulate"]>
  ): ReturnType<StoreService["simulate"]> {
    return await this.#run(async () => await this.service.simulate(...args));
  }

  async notifyTo(
    ...args: Parameters<StoreService["notifyTo"]>
  ): ReturnType<StoreService["notifyTo"]> {
    await this.#run(async () => {
      await this.service.notifyTo(...args);
    });
  }

  async chatId(...args: Parameters<StoreService["chatId"]>): ReturnType<StoreService["chatId"]> {
    return await this.#run(async () => await this.service.chatId(...args));
  }

  override async alarm(
    ...args: Parameters<StoreService["alarm"]>
  ): ReturnType<StoreService["alarm"]> {
    await this.#run(async () => {
      await this.service.alarm(...args);
    });
  }

  async llmCooldowns(
    ...args: Parameters<StoreService["llmCooldowns"]>
  ): ReturnType<StoreService["llmCooldowns"]> {
    return await this.#run(async () => await this.service.llmCooldowns(...args));
  }

  async noteLlmLimits(
    ...args: Parameters<StoreService["noteLlmLimits"]>
  ): ReturnType<StoreService["noteLlmLimits"]> {
    await this.#run(async () => {
      await this.service.noteLlmLimits(...args);
    });
  }

  async enqueueParse(
    ...args: Parameters<StoreService["enqueueParse"]>
  ): ReturnType<StoreService["enqueueParse"]> {
    await this.#run(async () => {
      await this.service.enqueueParse(...args);
    });
  }

  async drainParses(
    ...args: Parameters<StoreService["drainParses"]>
  ): ReturnType<StoreService["drainParses"]> {
    await this.#run(async () => {
      await this.service.drainParses(...args);
    });
  }

  async derive(...args: Parameters<StoreService["derive"]>): ReturnType<StoreService["derive"]> {
    return await this.#run(async () => await this.service.derive(...args));
  }

  async syncCalendar(
    ...args: Parameters<StoreService["syncCalendar"]>
  ): ReturnType<StoreService["syncCalendar"]> {
    return await this.#run(async () => await this.service.syncCalendar(...args));
  }

  async calendar(
    ...args: Parameters<StoreService["calendar"]>
  ): ReturnType<StoreService["calendar"]> {
    return await this.#run(async () => await this.service.calendar(...args));
  }

  async clearCalendar(
    ...args: Parameters<StoreService["clearCalendar"]>
  ): ReturnType<StoreService["clearCalendar"]> {
    await this.#run(async () => {
      await this.service.clearCalendar(...args);
    });
  }

  async addUsage(
    ...args: Parameters<StoreService["addUsage"]>
  ): ReturnType<StoreService["addUsage"]> {
    return await this.#run(async () => await this.service.addUsage(...args));
  }

  async usageForSleep(
    ...args: Parameters<StoreService["usageForSleep"]>
  ): ReturnType<StoreService["usageForSleep"]> {
    return await this.#run(async () => await this.service.usageForSleep(...args));
  }

  async usageDevices(
    ...args: Parameters<StoreService["usageDevices"]>
  ): ReturnType<StoreService["usageDevices"]> {
    return await this.#run(async () => await this.service.usageDevices(...args));
  }

  async usage(...args: Parameters<StoreService["usage"]>): ReturnType<StoreService["usage"]> {
    return await this.#run(async () => await this.service.usage(...args));
  }

  async notify(...args: Parameters<StoreService["notify"]>): ReturnType<StoreService["notify"]> {
    return await this.#run(async () => await this.service.notify(...args));
  }

  async pollFor(...args: Parameters<StoreService["pollFor"]>): ReturnType<StoreService["pollFor"]> {
    return await this.#run(async () => await this.service.pollFor(...args));
  }

  async listNotifications(
    ...args: Parameters<StoreService["listNotifications"]>
  ): ReturnType<StoreService["listNotifications"]> {
    return await this.#run(async () => await this.service.listNotifications(...args));
  }

  async readNotifications(
    ...args: Parameters<StoreService["readNotifications"]>
  ): ReturnType<StoreService["readNotifications"]> {
    await this.#run(async () => {
      await this.service.readNotifications(...args);
    });
  }

  async resolveNotification(
    ...args: Parameters<StoreService["resolveNotification"]>
  ): ReturnType<StoreService["resolveNotification"]> {
    return await this.#run(async () => await this.service.resolveNotification(...args));
  }

  async skipCalendarEvent(
    ...args: Parameters<StoreService["skipCalendarEvent"]>
  ): ReturnType<StoreService["skipCalendarEvent"]> {
    await this.#run(async () => {
      await this.service.skipCalendarEvent(...args);
    });
  }

  async runNotifications(
    ...args: Parameters<StoreService["runNotifications"]>
  ): ReturnType<StoreService["runNotifications"]> {
    return await this.#run(async () => await this.service.runNotifications(...args));
  }

  override async fetch(
    ...args: Parameters<StoreService["fetch"]>
  ): ReturnType<StoreService["fetch"]> {
    return await this.#run(async () => await this.service.fetch(...args));
  }

  async endLiveSessions(
    ...args: Parameters<StoreService["endLiveSessions"]>
  ): ReturnType<StoreService["endLiveSessions"]> {
    await this.#queue(async () => {
      await this.service.endLiveSessions(...args);
    });
  }

  override async webSocketMessage(
    ...args: Parameters<StoreService["webSocketMessage"]>
  ): ReturnType<StoreService["webSocketMessage"]> {
    await this.#run(async () => {
      await this.service.webSocketMessage(...args);
    });
  }

  override async webSocketClose(
    ...args: Parameters<StoreService["webSocketClose"]>
  ): Promise<void> {
    await this.#run(() => {
      this.service.webSocketClose(...args);
    });
  }
}
