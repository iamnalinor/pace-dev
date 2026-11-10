import { runInDurableObject } from "cloudflare:test";

import type { UserStore as HostedStore } from "../src/platform/cloudflare/user-store.ts";

import { createApp as createDomainApp } from "../src/app.ts";
import { actorDatabase, migrateActor } from "../src/platform/cloudflare/actor-storage.ts";
import { cloudflareBindings } from "../src/platform/cloudflare/bindings.ts";
import { actorContext } from "../src/platform/cloudflare/live-channel.ts";
import { UserStore as StoreService } from "../src/user-store/user-store.ts";

/** Direct service construction for cold-start and failure-injection tests. */
export class UserStore extends StoreService {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(actorContext(ctx), cloudflareBindings(env), {
      db: actorDatabase(ctx.storage),
      migrate: async () => {
        await migrateActor(ctx.storage);
      },
    });
  }
}

/** Keep assertions on the same domain object while the runtime hosts a thin RPC adapter. */
export const runInUserStore = async <T>(
  stub: DurableObjectStub<HostedStore>,
  operation: (service: StoreService, state: DurableObjectState) => Promise<T> | T,
): Promise<T> =>
  await runInDurableObject(
    stub,
    async (instance, state) => await operation(instance.service, state),
  );

/** Test-only host boundary: production's app accepts portable services, never raw bindings. */
export const createApp = (...args: Parameters<typeof createDomainApp>) => {
  const app = createDomainApp(...args);
  return {
    fetch: async (request: Request, env: Cloudflare.Env, ctx?: ExecutionContext) =>
      await app.fetch(request, cloudflareBindings(env), ctx),
  };
};

export type { LlmHealth } from "../src/platform/cloudflare/health-object.ts";
export { d1 } from "../src/platform/cloudflare/sqlite.ts";
