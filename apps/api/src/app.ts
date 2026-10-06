import { openapi } from "@elysiajs/openapi";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";

import type { Auth } from "./auth/auth.ts";
import type { Clock } from "./shared/clock.ts";
import type { Database } from "./shared/db/client.ts";
import type { Logger } from "./shared/logger.ts";

import { createAuthHandler, createAuthMacro } from "./auth/auth-plugin.ts";
import { createMeRoutes } from "./auth/me-routes.ts";
import { createExamplePostsFeature } from "./features/example-posts/example-posts-feature.ts";
import { createHealthRoutes } from "./health/health-routes.ts";
import { createOriginGuard } from "./shared/origin-guard.ts";

export type AppDependencies = {
  readonly auth: Auth;
  readonly clock: Clock;
  readonly db: Database;
  readonly exposeApiDocs: boolean;
  readonly logger: Logger;
  /** The origin users load the web app from (scheme://host[:port]). */
  readonly trustedOrigin: string;
};

/**
 * Builds the HTTP application from its dependencies. No `.listen()` here: `main.ts`
 * starts the server, tests start their own. `App` is the type the web client
 * (Eden) is generated from — keep route definitions chained so it stays precise.
 */
export const createApp = (deps: AppDependencies) => {
  const authMacro = createAuthMacro(deps.auth);
  return new Elysia()
    .onError(({ code, error, status }) => {
      if (code === "NOT_FOUND") {
        return status(404, { code: "not-found", message: "Not found" });
      }
      // Same `{ code, message }` shape as every other error, so the declared 422
      // schemas (and therefore Eden's error types) are true.
      if (code === "VALIDATION") {
        const message = error.all[0]?.summary ?? "Invalid request";
        return status(422, { code: "validation", message });
      }
      if (code !== "UNKNOWN" && code !== "INTERNAL_SERVER_ERROR") {
        // Validation/parse errors etc.: Elysia's default response (e.g. 422 + details).
        // Returning `error` itself would re-map validation errors to 400.
        // eslint-disable-next-line unicorn/no-useless-undefined -- undefined = "not handled here"
        return undefined;
      }
      deps.logger.error("Unhandled error", {
        code,
        error: error instanceof Error ? (error.stack ?? error.message) : "non-Error thrown",
      });
      // Never leak internals (stack traces, SQL) to the client.
      return status(500, { code: "internal", message: "Internal server error" });
    })
    .use(
      openapi({
        documentation: { info: { title: "Template API", version: "0.0.0" } },
        enabled: deps.exposeApiDocs,
        path: "/api/docs",
      }),
    )
    .use(createOriginGuard(deps.trustedOrigin))
    .use(createAuthHandler(deps.auth))
    .group("/api", (api) =>
      api
        .use(
          createHealthRoutes({
            checkDatabase: async () => {
              try {
                await deps.db.execute(sql`select 1`);
                return true;
              } catch {
                return false;
              }
            },
          }),
        )
        .use(createMeRoutes({ authMacro }))
        .use(createExamplePostsFeature({ authMacro, clock: deps.clock, db: deps.db })),
    );
};

export type App = ReturnType<typeof createApp>;
