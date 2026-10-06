import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import { endpoints, ok } from "@pace/core";

import type { AppEnv } from "./shared/app-env.ts";

import { createLogger } from "./shared/logger.ts";
import { mount } from "./shared/mount.ts";

const isAllowedOrigin = (origin: string, webOrigin: string): boolean =>
  // The web app, local dev servers and the Expo app (no origin / custom scheme).
  origin === webOrigin || origin.startsWith("http://localhost:") || origin === "null";

/**
 * Builds the HTTP app. No bindings are read at module scope: everything comes from
 * `c.env` per request, so tests and wrangler dev can supply different bindings.
 */
export const createApp = (): Hono<AppEnv> => {
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
      return c.json({ code: "http", message: thrown.message }, thrown.status);
    }
    createLogger("info").error("Unhandled error", { error: thrown.stack ?? thrown.message });
    // Never leak internals (stack traces, SQL) to the client.
    return c.json({ code: "internal", message: "Internal server error" }, 500);
  });
  app.notFound((c) => c.json({ code: "not-found", message: "Not found" }, 404));

  mount(app, endpoints.health, () => ok({ status: "ok" as const }));
  return app;
};
