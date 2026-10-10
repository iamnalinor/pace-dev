import type { MiddlewareHandler } from "hono";

import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../shared/app-env.ts";

import { d1 } from "../shared/db/d1.ts";
import { findSession, type SessionScope } from "./sessions.ts";

const BEARER = /^Bearer\s+(?<token>\S+)$/i;

export const readBearer = (header: string | undefined): string | undefined =>
  header === undefined ? undefined : BEARER.exec(header)?.groups?.["token"];

/**
Resolves the bearer token to a user; otherwise answers 401 `auth/unauthorized`. A device token
gets through only to an endpoint that names its scope (403 `auth/forbidden` elsewhere); a
sign-in reaches every endpoint.
*/
export const requireAuth =
  (scope?: SessionScope): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const token = readBearer(c.req.header("Authorization"));
    const access = token === undefined ? null : await findSession(d1(c.env.DB), token, Date.now());
    if (access === null) {
      const res = c.json({ code: "auth/unauthorized", message: "Unauthorized" }, 401);
      throw new HTTPException(401, { res });
    }
    if (access.scope !== null && access.scope !== scope) {
      const res = c.json({ code: "auth/forbidden", message: "This token cannot do that" }, 403);
      throw new HTTPException(403, { res });
    }
    c.set("user", access.user);
    await next();
  };
