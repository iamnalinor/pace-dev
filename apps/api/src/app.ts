import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import { endpoints, ok } from "@pace/core";

import type { ParseProvider } from "./parse/llm.ts";
import type { AppEnv } from "./shared/app-env.ts";

import { mountAuthRoutes } from "./auth/auth-routes.ts";
import { bindBotLogin } from "./auth/bot-login.ts";
import { isAllowed } from "./auth/whitelist.ts";
import { mountBotRoutes } from "./bot/bot-routes.ts";
import { telegramFetch, type TelegramTransport } from "./shared/telegram-api.ts";
import { mountLinkRoutes } from "./links/link-routes.ts";
import { mountNotifyRoutes } from "./notify/notify-routes.ts";
import { mountParseRoutes } from "./parse/parse-routes.ts";
import { parseProviders } from "./parse/providers.ts";
import { type Config, loadConfig } from "./shared/config.ts";
import { createLogger } from "./shared/logger.ts";
import { mount } from "./shared/mount.ts";
import { mountSyncRoutes } from "./sync/sync-routes.ts";

const isAllowedOrigin = (origin: string, webOrigin: string): boolean =>
  // The web app, local dev servers and the Expo app (no origin / custom scheme).
  origin === webOrigin || origin.startsWith("http://localhost:") || origin === "null";

/** Platform services the app talks to; tests replace them with recorders. */
export type AppDeps = {
  readonly telegramFetch: TelegramTransport;
  /** Outbound fetch for link previews; tests pass a fake. */
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** The LLMs the parse may ask; tests script their answers. */
  readonly parseProviders: (config: Config) => readonly ParseProvider[];
};

/**
Builds the HTTP app. No bindings are read at module scope: everything comes from
`c.env` per request, so tests and wrangler dev can supply different bindings.
*/
const PLATFORM_DEPS: AppDeps = {
  fetch: async (input, init) => await fetch(input, init),
  parseProviders,
  telegramFetch,
};

export const createApp = (deps: AppDeps = PLATFORM_DEPS): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use(
    "/api/*",
    cors({
      allowHeaders: ["Authorization", "Content-Type"],
      maxAge: 86_400,
      origin: (origin, c: Context<AppEnv>) =>
        isAllowedOrigin(origin, c.env.WEB_ORIGIN) ? origin : "",
    }),
  );
  app.onError((thrown, c) => {
    if (thrown instanceof HTTPException) {
      // Middleware answers with a prepared JSON response (`res`); anything else gets the generic shape.
      return thrown.res ?? c.json({ code: "http", message: thrown.message }, thrown.status);
    }
    createLogger("info").error("Unhandled error", { error: thrown.stack ?? thrown.message });
    // Never leak internals (stack traces, SQL) to the client.
    return c.json({ code: "internal", message: "Internal server error" }, 500);
  });
  app.notFound((c) => c.json({ code: "not-found", message: "Not found" }, 404));
  app.use(async (c, next) => {
    const config = loadConfig(c.env);
    if (!config.ok) {
      createLogger("info").error(config.error);
      const res = c.json({ code: "internal", message: "Internal server error" }, 500);
      throw new HTTPException(500, { res });
    }
    c.set("config", config.value);
    await next();
  });

  mount(app, endpoints.health, () => ok({ status: "ok" as const }));
  mountAuthRoutes(app);
  mountBotRoutes(app, {
    bindLogin: bindBotLogin,
    isAllowed,
    parseProviders: deps.parseProviders,
    telegramFetch: deps.telegramFetch,
  });
  mountSyncRoutes(app);
  mountLinkRoutes(app, deps.fetch);
  mountParseRoutes(app, deps.parseProviders);
  mountNotifyRoutes(app);
  return app;
};
