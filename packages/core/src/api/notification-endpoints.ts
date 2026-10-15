import { z } from "zod";

import { endpoint } from "./endpoint.ts";
import { DoneSchema } from "./schemas/cloud.ts";
import {
  NotificationsOutputSchema,
  NotificationsQuerySchema,
  PollOutputSchema,
  PollQuerySchema,
  PushMethodsSchema,
  PushSubscriptionOutputSchema,
  PushSubscriptionSchema,
  ReadNotificationsSchema,
  ResolvedNotificationSchema,
  ResolveNotificationSchema,
} from "./schemas/notify.ts";

/** The notification pool and how devices get it (part of `endpoints`). */
export const notificationEndpoints = {
  /** The notification pool, newest first (each client filters by its platform's channel). */
  list: endpoint({
    auth: true,
    method: "GET",
    output: NotificationsOutputSchema,
    path: "/api/notifications",
    query: NotificationsQuerySchema,
  }),
  /** Marks notifications read: the ones named, or all. */
  read: endpoint({
    auth: true,
    body: ReadNotificationsSchema,
    method: "POST",
    output: DoneSchema,
    path: "/api/notifications/read",
  }),
  /**
    Answers a notification (Attend, Skip, "Yes, still", Stop) or puts it away (`read`): what the
    answer means is written, and the notification is taken back on every other channel.
  */
  resolve: endpoint({
    auth: true,
    body: ResolveNotificationSchema,
    method: "POST",
    output: ResolvedNotificationSchema,
    params: z.object({ id: z.string().min(1).max(64) }),
    path: "/api/notifications/:id/resolve",
  }),
  /**
    What waits for this device when its push method is `poll` (its background check, and the
    open app on a live notice); passing the last cursor acknowledges what came before.
  */
  poll: endpoint({
    auth: true,
    method: "GET",
    output: PollOutputSchema,
    path: "/api/push/poll",
    query: PollQuerySchema,
  }),
  /** The push methods the server accepts now (read before registering, and on every start). */
  pushMethods: endpoint({
    auth: false,
    method: "GET",
    output: PushMethodsSchema,
    path: "/api/push/methods",
  }),
  /**
    How this session's device gets system notifications while the app is closed; a method the
    server does not accept is refused with 409 `push/method-unavailable`.
  */
  push: endpoint({
    auth: true,
    body: PushSubscriptionSchema,
    method: "PUT",
    output: PushSubscriptionOutputSchema,
    path: "/api/push/subscription",
  }),
} as const;
