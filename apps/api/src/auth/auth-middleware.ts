import type { MiddlewareHandler } from "hono";

import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../shared/app-env.ts";

import { d1 } from "../shared/db/d1.ts";
import { findSession } from "./sessions.ts";

const BEARER = /^Bearer\s+(?<token>\S+)$/i;

export const readBearer = (header: string | undefined): string | undefined =>
  header === undefined ? undefined : BEARER.exec(header)?.groups?.["token"];

/** Resolves the bearer token to a user; otherwise answers 401 `auth/unauthorized`. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readBearer(c.req.header("Authorization"));
  const user = token === undefined ? null : await findSession(d1(c.env.DB), token, Date.now());
  if (user === null) {
    const res = c.json({ code: "auth/unauthorized", message: "Unauthorized" }, 401);
    throw new HTTPException(401, { res });
  }
  c.set("user", user);
  await next();
};
