import type { Context, Hono } from "hono";

import { eq } from "drizzle-orm";

import { endpoints, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { users } from "../shared/db/d1-schema.ts";
import { d1 } from "../shared/db/d1.ts";
import { mount } from "../shared/mount.ts";
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

/**
`DELETE /api/me`: the account goes for good. MCP clients lose their grants, the Durable
Object drops the event log, and the user row goes with its sessions and login links
(they cascade). A later login of the same Telegram id starts a new, empty account.
*/
export const mountAccountRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.deleteMe, async ({ c }) => {
    const user = requireUser(c);
    await revokeGrants(c, user.id);
    await c.env.USER_STORE.get(c.env.USER_STORE.idFromName(user.id)).wipe();
    await d1(c.env.DB).delete(users).where(eq(users.id, user.id));
    return ok({ deleted: true as const });
  });
};
