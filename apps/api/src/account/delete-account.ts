import type { Context } from "hono";

import { eq } from "drizzle-orm";

import type { AppEnv } from "../shared/app-env.ts";

import { users } from "../shared/db/d1-schema.ts";
import { d1 } from "../shared/db/d1.ts";
import { oauthHelpers } from "../shared/oauth-helpers.ts";

/** Revokes every OAuth grant of the user, a page at a time. */
const revokeGrants = async (c: Context<AppEnv>, userId: string, cursor?: string): Promise<void> => {
  const helpers = oauthHelpers(c);
  const page = await helpers.listUserGrants(userId, {
    limit: 100,
    ...(cursor !== undefined && { cursor }),
  });
  await Promise.all(
    page.items.map(async (grant) => {
      await helpers.revokeGrant(grant.id, userId);
    }),
  );
  if (page.cursor !== undefined) {
    await revokeGrants(c, userId, page.cursor);
  }
};

/** Only the Telegram callback (or the isolated test route) can call this. */
export const deleteAccount = async (c: Context<AppEnv>, userId: string): Promise<void> => {
  await revokeGrants(c, userId);
  await c.env.USER_STORE.get(c.env.USER_STORE.idFromName(userId)).wipe();
  await d1(c.env.DB).delete(users).where(eq(users.id, userId));
};
