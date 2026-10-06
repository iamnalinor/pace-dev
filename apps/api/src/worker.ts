import { createApp } from "./app.ts";

export { UserStore } from "./user-store/user-store.ts";

const app = createApp();

export default {
  fetch: async (request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> =>
    await app.fetch(request, env, ctx),
} satisfies ExportedHandler<Cloudflare.Env>;
