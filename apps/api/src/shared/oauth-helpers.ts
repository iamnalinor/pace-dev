import type { Context } from "hono";

import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "./app-env.ts";
import type { OAuth } from "./ports/oauth.ts";

/** The helpers the provider attaches to every request it routes to the Hono app. */
export const oauthHelpers = (c: Context<AppEnv>): OAuth => {
  const helpers = c.env.OAUTH_PROVIDER;
  if (helpers === undefined) {
    throw new HTTPException(500, { message: "OAuth provider is not mounted" });
  }
  return helpers;
};
