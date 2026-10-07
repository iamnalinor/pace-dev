import type { Context, Hono } from "hono";

import { endpoints, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { mount } from "../shared/mount.ts";

/** The signed-in user's Durable Object: its id is the user id. */
const userStore = (c: Context<AppEnv>) =>
  c.env.USER_STORE.get(c.env.USER_STORE.idFromName(requireUser(c).id));

export const mountSyncRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.sync.push, async ({ c, body }) => {
    const result = await userStore(c).append(body.events, { now: new Date().toISOString() });
    return ok({ accepted: [...result.accepted], rejected: [...result.rejected], seq: result.seq });
  });

  mount(app, endpoints.sync.pull, async ({ c, query }) => {
    const result = await userStore(c).list(query.since, query.limit);
    return ok({ events: [...result.events], more: result.more, seq: result.seq });
  });

  mount(app, endpoints.sync.observations, async ({ c, body }) => {
    const accepted = await userStore(c).appendObservations(body.observations);
    return ok({ accepted });
  });
};
