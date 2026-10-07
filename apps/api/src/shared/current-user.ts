import type { Context } from "hono";

import { HTTPException } from "hono/http-exception";

import type { AppEnv, CurrentUser } from "./app-env.ts";

/** The user the auth guard attached; throwing here means a handler was mounted without the guard. */
export const requireUser = (c: Context<AppEnv>): CurrentUser => {
  const user = c.get("user");
  if (user === undefined) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return user;
};
