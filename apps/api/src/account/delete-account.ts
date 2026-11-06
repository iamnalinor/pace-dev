import type { Context } from "hono";

import { eq } from "drizzle-orm";

import type { AppEnv } from "../shared/app-env.ts";

import { users } from "../shared/db/d1-schema.ts";
import { revokeAllGrants } from "../shared/oauth-grants.ts";

/**
Only the Telegram callback (or the isolated test route) can call this. The sessions go with the
user (cascade), and so do their live sockets.
*/
export const deleteAccount = async (c: Context<AppEnv>, userId: string): Promise<void> => {
  // Straight from OAUTH_KV, as the sessions list does: on a server no https origin fits, no provider
  // fronts the app and its helpers are absent, while grants from when it had one may remain (N4).
  await revokeAllGrants(c.env.OAUTH_KV, userId);
  const store = c.env.USER_STORE.of(userId);
  await store.wipe();
  await c.env.DB.delete(users).where(eq(users.id, userId));
  await store.endLiveSessions();
};
