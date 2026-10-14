import type { Context, Hono } from "hono";

import { endpoints, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { mount } from "../shared/mount.ts";
import { socketUser, tokenFromProtocols } from "../shared/socket-auth.ts";

/** The signed-in user's Durable Object: its id is the user id. */
const userStore = (c: Context<AppEnv>) =>
  c.env.USER_STORE.get(c.env.USER_STORE.idFromName(requireUser(c).id));

/**
The live channel (`GET /api/sync/live`, a WebSocket): the user's store says `changed` as soon
as the log grows from anywhere but the listening device, so a client pulls at once instead
of polling. Not an `endpoint()`: an upgrade is not a JSON call. The bearer comes in the
subprotocols, since a browser cannot set headers on a socket.
*/
const mountLiveRoute = (app: Hono<AppEnv>): void => {
  app.get("/api/sync/live", async (c) => {
    if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
      return c.json({ code: "upgrade-required", message: "Open this as a WebSocket" }, 426);
    }
    const user = await socketUser(
      c.env,
      tokenFromProtocols(c.req.header("Sec-WebSocket-Protocol") ?? null),
    );
    if (user === null) {
      return c.json({ code: "auth/unauthorized", message: "Unauthorized" }, 401);
    }
    const store = c.env.USER_STORE.get(c.env.USER_STORE.idFromName(user.id));
    return await store.fetch(c.req.raw);
  });
};

export const mountSyncRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.sync.push, async ({ c, body }) => {
    const result = await userStore(c).append(body.events, { now: new Date().toISOString() });
    return ok({ accepted: [...result.accepted], rejected: [...result.rejected], seq: result.seq });
  });

  mount(app, endpoints.sync.pull, async ({ c, query }) => {
    const result = await userStore(c).list(query.since, query.limit);
    return ok({
      events: [...result.events],
      more: result.more,
      seq: result.seq,
      storeId: result.storeId,
    });
  });

  mountLiveRoute(app);
};
