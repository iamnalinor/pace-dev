import type { Config } from "./config.ts";

export type CurrentUser = {
  readonly id: string;
  readonly telegramId: string;
  readonly name: string;
  readonly firstName: null | string;
  readonly username: null | string;
  readonly photoUrl: null | string;
};

/** What opened a session: a browser, the phone app, a computer's agent, or a dev login. */
export type SessionKind = "agent" | "app" | "browser" | "dev";

/** Hono environment of the Worker: bindings come from wrangler.jsonc (typed by `wrangler types`). */
export type AppEnv = {
  Bindings: Cloudflare.Env;
  Variables: {
    /** Parsed vars and secrets, set once per request by the config middleware. */
    config: Config;
    /** Set by the auth guard on endpoints declared `auth: true`. */
    user?: CurrentUser;
    /** Set by the auth guard: the session the bearer belongs to. */
    sessionId?: string;
    /**
    Set by the auth guard: what opened that session, as the server recorded it at sign-in (only
    an `app` session is a phone whatever its requests claim).
    */
    sessionKind?: SessionKind;
    /** Set for a device token: the computer it belongs to, whatever its requests claim. */
    device?: undefined | { readonly id: string; readonly name: string };
  };
};
