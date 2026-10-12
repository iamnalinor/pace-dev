import type { Hono } from "hono";

import { endpoints, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { mount } from "../shared/mount.ts";
import { userStoreOf } from "../shared/user-store-of.ts";

/**
`GET /api/notify/plan`: what the phone schedules as local reminders for the next day.
`GET /api/decisions`: the decision log, filtered by task, time range or text.
*/
export const mountNotifyRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.notify.plan, async ({ c }) =>
    ok({ items: [...(await userStoreOf(c).notifyPlan(new Date().toISOString()))] }),
  );

  mount(app, endpoints.decisions.list, async ({ c, query }) =>
    ok({ decisions: [...(await userStoreOf(c).decisions(query))] }),
  );
};
