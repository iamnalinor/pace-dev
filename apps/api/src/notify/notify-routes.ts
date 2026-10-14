import type { Hono } from "hono";

import { endpoints, err, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { ResolveErrorCode } from "../shared/contract.ts";

import { requireUser } from "../shared/current-user.ts";
import { mount, type Problem } from "../shared/mount.ts";
import { subscribe, unsubscribe } from "../shared/push-subscriptions.ts";
import { acceptedMethods, pushConfigOf } from "../shared/push/registry.ts";
import { userStoreOf } from "../shared/user-store-of.ts";

/** Each refusal of an answer as HTTP: every code has its entry (the type makes it exhaustive). */
const RESOLVE_PROBLEMS: Readonly<Record<ResolveErrorCode, Omit<Problem, "code">>> = {
  "event/invalid": { message: "The answer could not be written", status: 409 },
  "event/not-found": { message: "The answer could not be written", status: 409 },
  "notification/mismatch": { message: "That answer does not fit this notification", status: 422 },
  "notification/not-found": { message: "No such notification", status: 404 },
  "preset/unknown": { message: "The answer could not be written", status: 409 },
  "retro/before-created": { message: "The answer could not be written", status: 409 },
  "retro/future": { message: "The answer could not be written", status: 409 },
  "retro/nothing-to-submit": { message: "The answer could not be written", status: 409 },
  "retro/task-closed": { message: "The answer could not be written", status: 409 },
  "subtask/submitted": { message: "The answer could not be written", status: 409 },
  "subtask/unknown": { message: "The answer could not be written", status: 409 },
  "task/unknown": { message: "The answer could not be written", status: 409 },
};

const resolveProblem = (code: ResolveErrorCode): Problem => ({ code, ...RESOLVE_PROBLEMS[code] });

/** How this device gets system notifications: the methods, its registration, its poll. */
const mountPushRoutes = (app: Hono<AppEnv>): void => {
  mount(app, endpoints.notifications.pushMethods, async ({ c }) =>
    ok({ pushMethods: [...(await acceptedMethods(c.env.DB, pushConfigOf(c.env), Date.now()))] }),
  );

  mount(app, endpoints.notifications.push, async ({ body, c }) => {
    const sessionId = c.get("sessionId") ?? "";
    // One method per device: registering replaces whatever it had.
    await unsubscribe(c.env.DB, sessionId);
    if (body.method === "none") {
      return ok({ method: "none" as const });
    }
    const accepted = await acceptedMethods(c.env.DB, pushConfigOf(c.env), Date.now());
    if (!accepted.includes(body.method)) {
      return err({
        code: "push/method-unavailable",
        message: "This server does not push that way now",
        status: 409,
      });
    }
    await subscribe(c.env.DB, {
      // A polling device is its session: it fetches what waits for it.
      endpoint: body.method === "fcm" ? body.endpoint : sessionId,
      now: Date.now(),
      sessionId,
      transport: body.method,
      userId: requireUser(c).id,
    });
    return ok({ method: body.method });
  });

  mount(app, endpoints.notifications.poll, async ({ c, query }) => {
    const polled = await userStoreOf(c).pollFor(c.get("sessionId") ?? "", {
      after: query.after,
      now: new Date().toISOString(),
    });
    return ok({
      cursor: polled.cursor,
      entries: polled.entries.map((entry) =>
        entry.type === "show"
          ? {
              body: entry.body,
              notification: entry.notification ?? null,
              notificationId: entry.notificationId,
              title: entry.title,
              type: entry.type,
            }
          : { notificationId: entry.notificationId, type: entry.type },
      ),
    });
  });
};

/**
The notification pool (list, read, answer), how this device gets pushes, and the decision log
(`GET /api/decisions`, the assistant's log).
*/
export const mountNotifyRoutes = (app: Hono<AppEnv>): void => {
  mountPushRoutes(app);
  mount(app, endpoints.notifications.list, async ({ c, query }) => {
    const page = await userStoreOf(c).listNotifications(query);
    return ok({
      deliveries: Object.fromEntries(
        Object.entries(page.deliveries).map(([id, entries]) => [id, [...entries]]),
      ),
      items: [...page.items],
      more: page.more,
    });
  });

  mount(app, endpoints.notifications.read, async ({ body, c }) => {
    await userStoreOf(c).readNotifications(body, new Date().toISOString());
    return ok({ ok: true as const });
  });

  mount(app, endpoints.notifications.resolve, async ({ body, c, params }) => {
    const result = await userStoreOf(c).resolveNotification(params.id, body.resolution, {
      now: new Date().toISOString(),
      origin: body.from,
    });
    return result.ok ? ok({ notification: result.value }) : err(resolveProblem(result.error.code));
  });

  mount(app, endpoints.calendar.skip, async ({ body, c }) => {
    await userStoreOf(c).skipCalendarEvent(body.eventKey, {
      now: new Date().toISOString(),
      origin: "app",
    });
    return ok({ ok: true as const });
  });

  mount(app, endpoints.decisions.list, async ({ c, query }) =>
    ok({ decisions: [...(await userStoreOf(c).decisions(query))] }),
  );
};
