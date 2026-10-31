import type { Context, Hono } from "hono";

import { endpoints, err, ok, type STORE_CHANGED } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { mount, type Problem } from "../shared/mount.ts";
import { isOutdatedClient, outdatedClient } from "../shared/protocol.ts";
import { socketUser, tokenFromProtocols } from "../shared/socket-auth.ts";

/** Why a push was refused, as the client sees it (one entry per error code). */
const PUSH_PROBLEMS: Readonly<Record<typeof STORE_CHANGED, Problem>> = {
  "store/changed": {
    code: "store/changed",
    message: "The store was reset since the last pull; pull again before pushing",
    status: 409,
  },
};

/** The signed-in user's Durable Object: its id is the user id. */
const userStore = (c: Context<AppEnv>) =>
  c.env.USER_STORE.get(c.env.USER_STORE.idFromName(requireUser(c).id));

/**
The live channel (`GET /api/sync/live`, a WebSocket): the user's store says `changed` as soon
as the log grows from anywhere but the listening device, so a client pulls at once instead
of polling. Not an `endpoint()`: an upgrade is not a JSON call. The bearer comes in the
subprotocols and the app's protocol in the `protocol` query, since a browser cannot set headers
on a socket.
*/
const mountLiveRoute = (app: Hono<AppEnv>): void => {
  app.get("/api/sync/live", async (c) => {
    if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
      return c.json({ code: "upgrade-required", message: "Open this as a WebSocket" }, 426);
    }
    if (isOutdatedClient(c.req.query("protocol"))) {
      return outdatedClient(c);
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
    const result = await userStore(c).push(body.storeId, body.events, {
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      return err(PUSH_PROBLEMS[result.error]);
    }
    const { accepted, rejected, seq } = result.value;
    return ok({ accepted: [...accepted], rejected: [...rejected], seq });
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
