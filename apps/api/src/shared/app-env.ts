import type { Config } from "./config.ts";

export type CurrentUser = {
  readonly id: string;
  readonly telegramId: string;
  readonly name: string;
  readonly username: null | string;
  readonly photoUrl: null | string;
};

/** Hono environment of the Worker: bindings come from wrangler.jsonc (typed by `wrangler types`). */
export type AppEnv = {
  Bindings: Cloudflare.Env;
  Variables: {
    /** Parsed vars and secrets, set once per request by the config middleware. */
    config: Config;
    /** Set by the auth guard on endpoints declared `auth: true`. */
    user?: CurrentUser;
  };
};
