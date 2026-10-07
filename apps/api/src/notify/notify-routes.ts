import type { Context, Hono } from "hono";

import { endpoints, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { mount } from "../shared/mount.ts";

/**
`GET /api/notify/plan`: what the phone schedules as local reminders for the next day.
`GET /api/decisions`: the decision log, filtered by task, time range or text.
*/
const storeOf = (c: Context<AppEnv>) =>
  c.env.USER_STORE.get(c.env.USER_STORE.idFromName(requireUser(c).id));

export const mountNotifyRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.notify.plan, async ({ c }) =>
    ok({ items: [...(await storeOf(c).notifyPlan(new Date().toISOString()))] }),
  );

  mount(app, endpoints.decisions.list, async ({ c, query }) =>
    ok({ decisions: [...(await storeOf(c).decisions(query))] }),
  );
};
