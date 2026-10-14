import { z } from "zod";

import type { NotificationKind } from "../model/notification-channels.ts";

import { loosen } from "../api/loose.ts";
import { knownValue } from "../api/tolerant.ts";
import { InstantSchema } from "../events/payloads.ts";

/**
A sign-in to the account. The sessions feature fills it: which session, what kind of client
("web", "android", a device name), a readable name ("Chrome on macOS"), where from.
*/
export const LoginPayloadSchema = z.strictObject({
  sessionId: z.string().min(1).max(64),
  kind: z.string().min(1).max(40),
  name: z.string().max(120),
  ip: z.string().max(64),
  country: z.string().max(80),
  city: z.string().max(80).optional(),
});

/** One task of a digest: its deadline is within a day of the next digest. */
export const DigestTaskSchema = z.strictObject({
  taskId: z.string().min(1),
  title: z.string(),
  dueAt: InstantSchema,
  dueTz: z.string().nullable(),
});

/** The deadline digest of one slot: the tasks due before the next slot's day is out. */
export const DeadlineDigestPayloadSchema = z.strictObject({
  slot: InstantSchema,
  tasks: z.array(DigestTaskSchema).min(1),
});

/** A calendar event (own or accepted) starting: Attend or Skip. */
export const EventStartPayloadSchema = z.strictObject({
  eventKey: z.string().min(1),
  title: z.string(),
  start: InstantSchema,
  end: InstantSchema,
  location: z.string().optional(),
});

/** The running activity past its reminder (`REMIND_FACTOR` × its Expect): "Still doing X?". */
export const ActivityOverrunPayloadSchema = z.strictObject({
  activityId: z.string().min(1),
  label: z.string(),
  startAt: InstantSchema,
  expectMinutes: z.number().int().positive(),
  /** The reminder instant this ask is for; a "yes" moves the next one on. */
  askedAt: InstantSchema,
});

export type LoginPayload = z.output<typeof LoginPayloadSchema>;
export type DigestTask = z.output<typeof DigestTaskSchema>;
export type DeadlineDigestPayload = z.output<typeof DeadlineDigestPayloadSchema>;
export type EventStartPayload = z.output<typeof EventStartPayloadSchema>;
export type ActivityOverrunPayload = z.output<typeof ActivityOverrunPayloadSchema>;

/** Each kind's payload, as `notify(kind, payload)` takes it. */
export type PayloadOf = {
  readonly login: LoginPayload;
  readonly deadline_digest: DeadlineDigestPayload;
  readonly event_start: EventStartPayload;
  readonly activity_overrun: ActivityOverrunPayload;
};

export const PAYLOAD_SCHEMAS = {
  login: LoginPayloadSchema,
  deadline_digest: DeadlineDigestPayloadSchema,
  event_start: EventStartPayloadSchema,
  activity_overrun: ActivityOverrunPayloadSchema,
} as const satisfies Record<NotificationKind, z.ZodType>;

/** A notification about to join the pool. */
export type NewNotification = {
  [K in NotificationKind]: { readonly kind: K; readonly payload: PayloadOf[K] };
}[NotificationKind];

/**
How a notification was settled: an answer (attended, skipped, still going, stopped), seen and
put away (`read`), or left until it no longer mattered (`expired`).
*/
export const RESOLUTIONS = ["attended", "skipped", "still", "stopped", "read", "expired"] as const;

export type Resolution = (typeof RESOLUTIONS)[number];

/** The answers a person can give, per kind; every kind can also be put away as read. */
export const ANSWERS = {
  login: [],
  deadline_digest: [],
  event_start: ["attended", "skipped"],
  activity_overrun: ["still", "stopped"],
} as const satisfies Record<NotificationKind, readonly Resolution[]>;

/** The answer resolutions a person gives (not `read` or `expired`): the ones of `ANSWERS`. */
export type Answer = (typeof ANSWERS)[NotificationKind][number];

/** Every answer some kind has, once each (the phone's buttons, what an answer may be). */
export const ALL_ANSWERS: readonly Answer[] = [...new Set(Object.values(ANSWERS).flat())];

/** Whether a value (a button's identifier, say) is one of the answers. */
export const isAnswer = (value: string): value is Answer =>
  (ALL_ANSWERS as readonly string[]).includes(value);

/** Whether a person may settle a notification of `kind` this way. */
export const canResolveAs = (kind: NotificationKind, resolution: Resolution): boolean =>
  resolution === "read" || (ANSWERS[kind] as readonly Resolution[]).includes(resolution);

const common = {
  id: z.string().min(1),
  createdAt: InstantSchema,
  readAt: InstantSchema.nullable(),
  resolvedAt: InstantSchema.nullable(),
  /** A resolution a newer server added reads as `read`: settled, with nothing to act on. */
  resolution: knownValue(RESOLUTIONS, "read").nullable(),
};

/**
A notification of the pool as the API lists it. Payloads are written strict (the server checks
what it adds against them); a client reads them loosened (`loosen`, `knownValues`).
*/
export const NotificationSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("login"), payload: LoginPayloadSchema }),
  z.object({ ...common, kind: z.literal("deadline_digest"), payload: DeadlineDigestPayloadSchema }),
  z.object({ ...common, kind: z.literal("event_start"), payload: EventStartPayloadSchema }),
  z.object({
    ...common,
    kind: z.literal("activity_overrun"),
    payload: ActivityOverrunPayloadSchema,
  }),
]);

export type PoolNotification = z.output<typeof NotificationSchema>;

const DismissNoticeSchema = z.object({
  type: z.literal("dismiss"),
  id: z.string(),
  resolution: knownValue(RESOLUTIONS, "read"),
});

const LiveNotices = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notification"), notification: NotificationSchema }),
  DismissNoticeSchema,
  z.object({ type: z.literal("read") }),
  z.object({ type: z.literal("push-methods-changed") }),
]);

/**
What the live socket says about the pool to every open client: a notification new, one resolved,
some read, the push methods changed. An open app whose push method is `poll` fetches its queue at
once on a new or resolved one, so it shows the notification without waiting for the next check.
Read loosened, as an answer is: a newer server's extra keys are dropped.
*/
export const LiveNoticeSchema = loosen(LiveNotices);

export type LiveNotice = z.output<typeof LiveNoticeSchema>;

/** The key of one occurrence of a calendar event, the same on every phone and the server. */
export const calendarEventKey = (event: {
  readonly title: string;
  readonly startAt: string;
}): string => `${event.startAt}@${event.title}`;

/**
What a notification is about, the same for one subject on every channel: an event's key, the
activity and the moment it was asked, the digest slot, the session. A phone that rings on its
own (no push) names its local notification after it, so a resolution anywhere finds it.
*/
export const refOf = (notification: NewNotification): string => {
  switch (notification.kind) {
    case "login": {
      return notification.payload.sessionId;
    }
    case "deadline_digest": {
      return notification.payload.slot;
    }
    case "event_start": {
      return notification.payload.eventKey;
    }
    case "activity_overrun": {
      return overrunRef(notification.payload);
    }
  }
};

/** An overrun's subject: the activity at the moment it was asked about. */
export const overrunRef = (ask: {
  readonly activityId: string;
  readonly askedAt: string;
}): string => `${ask.activityId}@${ask.askedAt}`;
