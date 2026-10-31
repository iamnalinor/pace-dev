import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import { endpoints, MIN_CLIENT_PROTOCOL, ok, PROTOCOL, PROTOCOL_HEADER } from "@pace/core";

import type { AppEnv } from "./shared/app-env.ts";
import type { ParseProvider } from "./shared/llm/llm.ts";

import { answerAccountConfirmation, mountAccountRoutes } from "./account/account-routes.ts";
import { mountAuthRoutes } from "./auth/auth-routes.ts";
import { bindBotLogin } from "./auth/bot-login.ts";
import { findUserIdByTelegramId } from "./auth/users.ts";
import { isAllowed } from "./auth/whitelist.ts";
import { mountBotRoutes } from "./bot/bot-routes.ts";
import { mountCloudRoutes } from "./cloud/cloud-routes.ts";
import { mountLinkRoutes } from "./links/link-routes.ts";
import { mountNotifyRoutes } from "./notify/notify-routes.ts";
import { mountParseRoutes } from "./parse/parse-routes.ts";
import { type Config, loadConfig } from "./shared/config.ts";
import { parseProviders } from "./shared/llm/providers.ts";
import { createLogger } from "./shared/logger.ts";
import { mount } from "./shared/mount.ts";
import { refuseOutdatedClients } from "./shared/protocol.ts";
import { pushConfigOf, pushMethodsOf } from "./shared/push/registry.ts";
import { telegramFetch, type TelegramTransport } from "./shared/telegram-api.ts";
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

/**
The calls an app too old for this server may still make: what the server is (so the app can say
why it is refused) and whether it is up.
*/
const SERVED_TO_ANY_PROTOCOL: ReadonlySet<string> = new Set([
  endpoints.health.path,
  endpoints.instance.path,
]);

/**
The calls anyone may make: whether the server is up, and `GET /api/instance` (the server's
identity, protocol and what it can do, read from config).
*/
const mountPublicRoutes = (app: Hono<AppEnv>, deps: AppDeps): void => {
  mount(app, endpoints.health, () => ok({ status: "ok" as const }));
  mount(app, endpoints.instance, async ({ c }) => {
    const config = c.get("config");
    const push = await pushMethodsOf(c.env.DB, pushConfigOf(c.env), Date.now());
    return ok({
      apiOrigin: config.apiOrigin ?? new URL(c.req.url).origin,
      botUsername: config.telegramBotUsername,
      features: {
        // The skipped slots were already logged by the calls that use the models; not again here.
        assistant: deps.parseProviders({ ...config, llmSkipped: [] }).length > 0,
        push: push.pushMethods.includes("fcm"),
      },
      loginMethods: ["telegram-widget" as const, "telegram-deeplink" as const],
      minClientProtocol: MIN_CLIENT_PROTOCOL,
      name: "Pace",
      protocol: PROTOCOL,
      version: config.version,
      webOrigin: config.webOrigin,
    });
  });
};

export const createApp = (deps: AppDeps = PLATFORM_DEPS): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use(
    "/api/*",
    cors({
      allowHeaders: ["Authorization", "Content-Type", PROTOCOL_HEADER],
      maxAge: 86_400,
      origin: (origin, c: Context<AppEnv>) =>
        isAllowedOrigin(origin, c.env.WEB_ORIGIN) ? origin : "",
    }),
    refuseOutdatedClients(SERVED_TO_ANY_PROTOCOL),
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

  mountPublicRoutes(app, deps);
  mountAuthRoutes(app, deps.telegramFetch);
  mountAccountRoutes(app, deps.telegramFetch);
  mountBotRoutes(app, {
    bindLogin: bindBotLogin,
    confirmAccount: answerAccountConfirmation,
    isAllowed,
    parseProviders: deps.parseProviders,
    telegramFetch: deps.telegramFetch,
    userIdOf: findUserIdByTelegramId,
  });
  mountSyncRoutes(app);
  mountLinkRoutes(app, deps.fetch);
  mountParseRoutes(app, deps.parseProviders);
  mountNotifyRoutes(app);
  mountCloudRoutes(app);
  return app;
};
