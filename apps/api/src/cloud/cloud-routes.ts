import type { Hono } from "hono";

import { endpoints, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { mount } from "../shared/mount.ts";
import { userStoreOf } from "../shared/user-store-of.ts";

/**
What the person's devices send beside the event log: the phone's calendar (own and accepted
events) and the apps in front on each device (names and times, never contents).
*/
const mountCalendar = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.calendar.sync, async ({ body, c }) =>
    ok({ stored: await userStoreOf(c).syncCalendar(body) }),
  );
  mount(app, endpoints.calendar.list, async ({ c, query }) =>
    ok({ events: [...(await userStoreOf(c).calendar(query))] }),
  );
  mount(app, endpoints.calendar.clear, async ({ c, query }) => {
    await userStoreOf(c).clearCalendar(query.deviceId);
    return ok({ ok: true as const });
  });
};

const mountUsage = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.usage.upload, async ({ body, c }) => {
    // A computer's token files its sessions under that computer, never under another device.
    const device = c.get("device");
    const upload =
      device === undefined ? body : { ...body, deviceId: device.id, deviceName: device.name };
    return ok({ stored: await userStoreOf(c).addUsage(upload) });
  });
  mount(app, endpoints.usage.list, async ({ c, query }) =>
    ok({ sessions: [...(await userStoreOf(c).usage(query))] }),
  );
};

export const mountCloudRoutes = (app: Hono<AppEnv>): void => {
  mountCalendar(app);
  mountUsage(app);
};
