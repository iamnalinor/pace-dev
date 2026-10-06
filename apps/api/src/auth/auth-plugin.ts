import { Elysia } from "elysia";

import type { Auth } from "./auth.ts";
import type { CurrentUser } from "./current-user.ts";

/**
 * Serves better-auth's own endpoints (sign-up, sign-in, sign-out, get-session, ...).
 * Registered on the root app: `.all` passes the untouched request, so better-auth
 * sees the full `/api/auth/*` path it is configured with.
 */
export const createAuthHandler = (auth: Auth) =>
  new Elysia().all("/api/auth/*", async ({ request }) => await auth.handler(request), {
    parse: "none",
  });

/**
 * `{ auth: true }` on a route: 401 without a valid session, otherwise the handler
 * receives `user: CurrentUser`. Features `.use()` this plugin to get the macro.
 */
export const createAuthMacro = (auth: Auth) =>
  // Named: Elysia deduplicates it when several features `.use()` it.
  new Elysia({ name: "auth-macro" }).macro({
    auth: {
      resolve: async ({ request: { headers }, status }) => {
        const session = await auth.api.getSession({ headers });
        if (session === null) {
          return status(401, { code: "auth/unauthorized", message: "Sign in required" });
        }
        const user: CurrentUser = {
          email: session.user.email,
          id: session.user.id,
          name: session.user.name,
        };
        return { user };
      },
    },
  });

export type AuthMacro = ReturnType<typeof createAuthMacro>;
