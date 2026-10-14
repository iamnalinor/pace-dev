import { z } from "zod";

import { NotificationSchema } from "../../notify/pool.ts";
import { knownOrNull, knownValue, knownValues } from "../tolerant.ts";

/** A page of the pool, newest first: `before` is the id the previous page ended at. */
export const NotificationsQuerySchema = z.object({
  before: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
Every notification, whatever its channels: each client shows the kinds whose channel for its
platform is on (the app on Android, the web in a browser) and counts the unread among those.
*/
/** One push attempt of a notification to a device, as the delivery log keeps it. */
const DeliveryEntrySchema = z.object({
  device: z.string(),
  method: z.string(),
  at: z.iso.datetime(),
  result: z.enum(["sent", "queued", "failed", "dismissed"]),
  reason: z.string().nullable(),
});

/** An entry with a result this client does not know is left out of the log. */
const DeliveriesSchema = knownValues(DeliveryEntrySchema);

export const NotificationsOutputSchema = z.object({
  /** A kind this client does not know yet (a newer server's) is left out, the rest shown. */
  items: knownValues(NotificationSchema),
  /** Per notification id, its delivery log (push attempts to devices), for the item's detail. */
  deliveries: z.record(z.string(), DeliveriesSchema),
  more: z.boolean(),
});

/** Marks the notifications named, or every one, read. */
const NotificationIdsSchema = z.array(z.string().min(1).max(64)).min(1).max(200);

export const ReadNotificationsSchema = z.union([
  z.strictObject({ ids: NotificationIdsSchema }),
  z.strictObject({ all: z.literal(true) }),
]);

/** An answer from the app or the web (`expired` is the server's own). */
export const ResolveNotificationSchema = z.strictObject({
  resolution: z.enum(["attended", "skipped", "still", "stopped", "read"]),
  /** The client answering: what it writes is recorded as coming from there. */
  from: z.enum(["app", "web"]).default("app"),
});

export const ResolvedNotificationSchema = z.object({ notification: NotificationSchema });

/** Skips one occurrence of a calendar event everywhere (`calendarEventKey`). */
export const CalendarSkipSchema = z.strictObject({ eventKey: z.string().min(1).max(400) });

/**
How this session's device gets system notifications, exactly one way: Firebase Cloud Messaging
with its token, `poll` (its periodic background check fetches them), or not at all (`none`).
*/
export const PushSubscriptionSchema = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("fcm"), endpoint: z.string().min(1).max(4096) }),
  z.strictObject({ method: z.literal("poll") }),
  z.strictObject({ method: z.literal("none") }),
]);

export const PushSubscriptionOutputSchema = z.object({
  method: knownValue(["fcm", "poll", "none"], "none"),
});

/**
The push methods this server accepts now: `fcm` while Firebase is set up and working, `poll`
always. A device registers with one of them, or none.
*/
export const PushMethodsSchema = z.object({
  /** A method this client cannot use (a newer server's) is not offered. */
  pushMethods: knownValues(z.enum(["fcm", "poll"])),
});

/** What a polling device fetches: everything after the cursor of its last fetch. */
export const PollQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
});

/**
What waits for a polling device, oldest first: notifications to show (under the pool id) and
ones to take back. The next fetch passes `cursor`, which acknowledges these.
*/
const PollShowSchema = z.object({
  type: z.literal("show"),
  notificationId: z.string(),
  title: z.string(),
  body: z.string(),
  /** As it stands now; `null` once gone (or of a kind this client does not know). */
  notification: knownOrNull(NotificationSchema),
});

const PollDismissSchema = z.object({ type: z.literal("dismiss"), notificationId: z.string() });

const PollEntrySchema = z.discriminatedUnion("type", [PollShowSchema, PollDismissSchema]);

export const PollOutputSchema = z.object({
  entries: knownValues(PollEntrySchema),
  cursor: z.number().int(),
});

export const DecisionsQuerySchema = z.object({
  taskId: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** One automatic decision with what it was based on, newest first. */
export const DecisionSchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  kind: z.string(),
  taskId: z.string().nullable(),
  rule: z.string(),
  inputs: z.unknown(),
  outcome: z.string(),
  explanation: z.string(),
});

export const DecisionsOutputSchema = z.object({
  decisions: z.array(DecisionSchema),
});

export type Decision = z.output<typeof DecisionSchema>;
