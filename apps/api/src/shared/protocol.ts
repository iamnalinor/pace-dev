import type { Context, MiddlewareHandler } from "hono";

import { HTTPException } from "hono/http-exception";

import { CLIENT_OUTDATED, MIN_CLIENT_PROTOCOL, PROTOCOL_HEADER } from "@pace/core";

import type { AppEnv } from "./app-env.ts";

/**
Whether the protocol an app sent (the `X-Pace-Protocol` header, or the live socket's `protocol`
query) is older than this server serves. Nothing sent, or nothing readable, is not: cached web
builds and older APKs send no protocol and keep working.
*/
export const isOutdatedClient = (sent: string | undefined): boolean => {
  const text = sent?.trim() ?? "";
  return /^\d+$/u.test(text) && Number(text) < MIN_CLIENT_PROTOCOL;
};

/** The refusal an outdated app gets: 426 with the code it shows "Update the app" for. */
export const outdatedClient = (c: Context<AppEnv>): Response =>
  c.json({ code: CLIENT_OUTDATED, message: "This server needs a newer version of the app" }, 426);

/**
Refuses calls from an app older than this server serves, except on the `exempt` paths (the ones
such an app needs to learn why). Runs after CORS, so the web app can read the refusal, and before
auth, so no session is looked up for it.
*/
export const refuseOutdatedClients =
  (exempt: ReadonlySet<string>): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!exempt.has(c.req.path) && isOutdatedClient(c.req.header(PROTOCOL_HEADER))) {
      throw new HTTPException(426, { res: outdatedClient(c) });
    }
    await next();
  };
