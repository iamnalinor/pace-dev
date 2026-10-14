import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import {
  type ActivityOverrunPayload,
  calendarAttend,
  type CoreState,
  type EventInput,
  type EventStartPayload,
  INITIAL_POOL_MEMORY,
  isChannelOn,
  newId,
  type PoolMemory,
  type PoolNotification,
  type Resolution,
  runningActivity,
  type Settings,
} from "@pace/core";

import type { AnswerOrigin } from "../shared/contract.ts";
import type { PushMessage, PushTransport, SendOutcome } from "../shared/push/transport.ts";
import type * as schema from "./schema.ts";

import {
  dropSubscription,
  noteSend,
  type PushSubscription,
  subscriptionsOf,
} from "../shared/push-subscriptions.ts";
import { isBroken, markBroken, type PushConfig, transportFor } from "../shared/push/registry.ts";
import {
  sendTelegramMessage,
  type TelegramTarget,
  wasTelegramMessageDeleted,
} from "../shared/telegram-api.ts";
import { logAttempt, takeBackDeliveries, wasDelivered } from "./delivery-rows.ts";
import { broadcast } from "./live-sockets.ts";
import { phoneContent, telegramMessage } from "./notify-text.ts";
import { setTelegramCopy, type StoredNotification } from "./pool-rows.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/** The outside channels a store delivers through; `null` / unconfigured ones are off. */
export type Couriers = {
  readonly telegram: null | TelegramTarget;
  readonly push: PushConfig;
};

/** What delivering needs: the store, the account's settings and chat, the instant. */
export type PoolDeps = {
  readonly db: Db;
  readonly ctx: DurableObjectState;
  /** The global D1 database: the push subscriptions of the user's sessions. */
  readonly binding: D1Database;
  readonly userId: string | undefined;
  readonly couriers: Couriers;
  readonly settings: Settings;
  readonly chatId: string | undefined;
  readonly webOrigin: string;
  readonly now: string;
};

const MEMORY_KEY = "pool:memory";
const RULES_KEY = "calendar:rules";

export const poolMemoryOf = async (storage: DurableObjectStorage): Promise<PoolMemory> =>
  (await storage.get<PoolMemory>(MEMORY_KEY)) ?? INITIAL_POOL_MEMORY;

export const savePoolMemory = async (
  storage: DurableObjectStorage,
  memory: PoolMemory,
): Promise<void> => {
  await storage.put(MEMORY_KEY, memory);
};

/** Series the phone answered "every time" for: never announced as they start. */
export const ruledSeriesOf = async (storage: DurableObjectStorage): Promise<readonly string[]> =>
  (await storage.get<readonly string[]>(RULES_KEY)) ?? [];

export const saveRuledSeries = async (
  storage: DurableObjectStorage,
  series: readonly string[],
): Promise<void> => {
  await storage.put(RULES_KEY, [...new Set(series)]);
};

const sendToTelegram = async (deps: PoolDeps, stored: StoredNotification): Promise<void> => {
  const { notification } = stored;
  const { chatId, couriers, settings } = deps;
  if (
    chatId === undefined ||
    couriers.telegram === null ||
    !isChannelOn(settings, notification.kind, "telegram")
  ) {
    await setTelegramCopy(deps.db, notification.id, {
      chatId: null,
      messageId: null,
      sentAt: null,
      state: "skipped",
    });
    return;
  }
  const message = telegramMessage(notification, settings, {
    now: deps.now,
    webOrigin: deps.webOrigin,
  });
  const messageId = await sendTelegramMessage(couriers.telegram, chatId, message);
  await setTelegramCopy(deps.db, notification.id, {
    chatId,
    messageId,
    sentAt: messageId === null ? null : deps.now,
    state: messageId === null ? "failed" : "sent",
  });
  // In the delivery log beside the pushes; taken back with them (`withdraw`).
  const attempt = {
    device: "Telegram",
    endpoint: chatId,
    method: "telegram",
    reason: messageId === null ? "failed" : null,
    result: messageId === null ? ("failed" as const) : ("sent" as const),
    sessionId: "telegram",
  };
  await logAttempt(deps.db, { attempt, notificationId: notification.id, now: deps.now });
};

/** After a push: a dead device address goes; refused credentials break the method for all. */
const afterSend = async (
  deps: PoolDeps,
  {
    outcome,
    subscription,
    transport,
  }: {
    readonly outcome: SendOutcome;
    readonly subscription: PushSubscription;
    readonly transport: PushTransport;
  },
): Promise<void> => {
  const now = Date.parse(deps.now);
  if (outcome === "gone") {
    await dropSubscription(deps.binding, subscription.id);
  } else if (outcome === "unavailable") {
    // On the wall clock, not the pass's instant: the mark is shared by everyone, and expires.
    await markBroken(deps.binding, transport, { now: Date.now(), reason: "credentials refused" });
    broadcast(deps.ctx, { type: "push-methods-changed" });
  } else {
    await noteSend(deps.binding, subscription.id, { isOk: outcome !== "failed", now });
  }
};

/**
One device by its push method, logged; nothing when it got this one already. A method not set
up on this server, or found broken, sends nothing: the log says it was unavailable.
*/
const pushToDevice = async (
  deps: PoolDeps,
  message: PushMessage,
  subscription: PushSubscription,
): Promise<void> => {
  const transport = transportFor(deps.couriers.push, subscription.transport);
  const { notification } = message;
  if (await wasDelivered(deps.db, notification.id, subscription.sessionId)) {
    return;
  }
  const address = { endpoint: subscription.endpoint, sessionId: subscription.sessionId };
  if (transport === null || (await isBroken(deps.binding, transport, Date.now()))) {
    const attempt = {
      ...address,
      device: subscription.device,
      method: subscription.transport,
      reason: "unavailable",
      result: "failed" as const,
    };
    await logAttempt(deps.db, { attempt, notificationId: notification.id, now: deps.now });
    return;
  }
  const outcome = await transport.send(address, message);
  const isOk = outcome === "sent" || outcome === "queued";
  const attempt = {
    ...address,
    device: subscription.device,
    method: transport.method,
    reason: isOk ? null : outcome,
    result: isOk ? outcome : ("failed" as const),
  };
  await logAttempt(deps.db, { attempt, notificationId: notification.id, now: deps.now });
  await afterSend(deps, { outcome, subscription, transport });
};

/**
Pushes to each device by its one push method (once per device: a retried alarm sends nothing
twice), logging every attempt. A dead device address drops its subscription until the app
registers again on its next start; credentials the method's provider refuses mark the method
broken for everyone, and open clients are told to choose again. There is never a fallback to
another method, so nothing arrives twice.
*/
const pushToDevices = async (deps: PoolDeps, notification: PoolNotification): Promise<void> => {
  if (deps.userId === undefined || !isChannelOn(deps.settings, notification.kind, "app")) {
    return;
  }
  const subscriptions = await subscriptionsOf(deps.binding, deps.userId, Date.parse(deps.now));
  const message = { ...phoneContent(notification, deps.settings, deps.now), notification };
  for (const subscription of subscriptions) {
    await pushToDevice(deps, message, subscription);
  }
};

/**
Delivers a notification just added to the pool: Telegram when its kind is on there and the chat
is known, every open client's feed over the live socket (a phone without push shows it from
there), and each phone's push method when the kind is on for the app.
*/
export const deliverNew = async (deps: PoolDeps, stored: StoredNotification): Promise<void> => {
  const { notification } = stored;
  await sendToTelegram(deps, stored);
  // Queued for polling devices before the open clients hear of it: an open app fetches at once.
  await pushToDevices(deps, notification);
  broadcast(deps.ctx, { notification, type: "notification" });
};

/** Deletes the Telegram copy, unless the answer came from Telegram (the bot edits it there). */
const deleteTelegramCopy = async (
  deps: PoolDeps,
  telegram: StoredNotification["telegram"],
  origin: AnswerOrigin,
): Promise<void> => {
  const { chatId, messageId, state } = telegram;
  const target = deps.couriers.telegram;
  if (origin === "telegram" || state !== "sent" || target === null) {
    return;
  }
  if (chatId !== null && messageId !== null) {
    await wasTelegramMessageDeleted(target, chatId, messageId);
  }
};

/**
Takes a resolved notification back everywhere: the Telegram copy is deleted unless the answer
came from Telegram (the bot edits it there), every push copy is dismissed through the method
that delivered it, and open clients update their feed.
*/
export const withdraw = async (
  deps: PoolDeps,
  stored: StoredNotification,
  { origin, resolution }: { readonly origin: AnswerOrigin; readonly resolution: Resolution },
): Promise<void> => {
  const { notification, telegram } = stored;
  await deleteTelegramCopy(deps, telegram, origin);
  const copies = await takeBackDeliveries(deps.db, notification.id, deps.now);
  for (const copy of copies) {
    await transportFor(deps.couriers.push, copy.method)?.dismiss(copy, notification.id);
  }
  broadcast(deps.ctx, { id: notification.id, resolution, type: "dismiss" });
};

const at = (
  occurredAt: string,
  body: Omit<EventInput, "occurredAt" | "precision" | "source">,
): EventInput => ({ ...body, occurredAt, precision: "exact", source: "system" }) as EventInput;

type AnswerContext = { readonly state: CoreState; readonly now: string };

/** Attend: the event tracked the way Now's offer does (`calendarAttend`: label and Expect fitted). */
const attendInputs = (
  { end, start, title }: EventStartPayload,
  { now, state }: AnswerContext,
): readonly EventInput[] => {
  const write = calendarAttend(
    state.time,
    { endAt: end, startAt: start, title },
    { activityId: newId(), now },
  );
  return [at(write.occurredAt, write.body)];
};

/** "Yes, still" moves the next ask on; Stop stops it; nothing once the activity is not running. */
const overrunInputs = (
  { activityId }: ActivityOverrunPayload,
  resolution: Resolution,
  { now, state }: AnswerContext,
): readonly EventInput[] => {
  if (runningActivity(state.time, now)?.id !== activityId) {
    return [];
  }
  if (resolution === "still") {
    return [at(now, { payload: { activityId, stillAt: now }, type: "activity.labelled" })];
  }
  return resolution === "stopped"
    ? [at(now, { payload: { activityId }, type: "activity.stopped" })]
    : [];
};

/**
The events an answer writes: Attend tracks the event, "Yes, still" and Stop act on the activity.
Skip and Read write nothing.
*/
export const answerInputs = (
  notification: PoolNotification,
  resolution: Resolution,
  context: AnswerContext,
): readonly EventInput[] => {
  if (notification.kind === "event_start") {
    return resolution === "attended" ? attendInputs(notification.payload, context) : [];
  }
  return notification.kind === "activity_overrun"
    ? overrunInputs(notification.payload, resolution, context)
    : [];
};
