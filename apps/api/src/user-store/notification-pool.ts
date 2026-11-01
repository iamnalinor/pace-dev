import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import {
  INITIAL_POOL_MEMORY,
  isChannelOn,
  type PoolMemory,
  type PoolNotification,
  type Settings,
} from "@pace/core";

import type { NotifyOptions } from "../shared/contract.ts";
import type { PushMessage, PushTransport, SendOutcome } from "../shared/push/transport.ts";
import type * as schema from "./schema.ts";

import {
  dropSubscription,
  moveToPolling,
  noteSend,
  type PushSubscription,
  subscriptionsOf,
} from "../shared/push-subscriptions.ts";
import {
  fcmProjectOf,
  isBroken,
  markBroken,
  type PushConfig,
  transportFor,
} from "../shared/push/registry.ts";
import {
  type OutgoingMessage,
  sendTelegramMessage,
  type TelegramTarget,
  wasTelegramMessageEdited,
} from "../shared/telegram-api.ts";
import {
  hasFailedCopy,
  latestAttempt,
  logAttempt,
  logUnavailable,
  wasDelivered,
} from "./delivery-rows.ts";
import { broadcast } from "./live-sockets.ts";
import { phoneContent, telegramMessage } from "./notify-text.ts";
import { setTelegramCopy, type StoredNotification } from "./pool-rows.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

/** The outside channels a store delivers through; `null` / unconfigured ones are off. */
export type Couriers = {
  readonly telegram: null | TelegramTarget;
  readonly push: PushConfig;
};

/** How a notification is delivered; `couriers` replaces the configured channels (tests). */
export type PoolNotifyOptions = NotifyOptions & { readonly couriers?: Couriers | undefined };

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

type Adopted = NotifyOptions["adoptTelegramMessage"];

/**
Puts the message in the chat: the adopted one edited into place when there is one and Telegram
takes the edit, else a new one (the adopted message is gone, say). Where it ended up; a `null`
message id when Telegram took neither.
*/
const placeInChat = async (
  target: TelegramTarget,
  { adopted, chatId, message }: { adopted: Adopted; chatId: string; message: OutgoingMessage },
): Promise<{ readonly chatId: string; readonly messageId: null | number }> => {
  return adopted !== undefined &&
    (await wasTelegramMessageEdited(target, { ...adopted, ...message }))
    ? adopted
    : { chatId, messageId: await sendTelegramMessage(target, chatId, message) };
};

const sendToTelegram = async (
  deps: PoolDeps,
  stored: StoredNotification,
  adopted: Adopted,
): Promise<void> => {
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
  const placed = await placeInChat(couriers.telegram, { adopted, chatId, message });
  const { messageId } = placed;
  await setTelegramCopy(deps.db, notification.id, {
    chatId: placed.chatId,
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

/**
After a push: a dead device address goes; refused credentials break the method for all; a device
FCM can never reach from this server polls from now on (an open app is told to register again,
and gets polling). The subscription to push through instead, if any.
*/
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
): Promise<null | PushSubscription> => {
  const { binding, ctx } = deps;
  switch (outcome) {
    case "gone": {
      await dropSubscription(binding, subscription.id);
      return null;
    }
    case "unavailable": {
      // On the wall clock, not the pass's instant: the mark is shared by everyone, and expires.
      await markBroken(binding, transport, { now: Date.now(), reason: "credentials refused" });
      broadcast(ctx, { type: "push-methods-changed" });
      return null;
    }
    case "incompatible": {
      const projectId = fcmProjectOf(deps.couriers.push) ?? "";
      const userId = deps.userId ?? "";
      const polling = await moveToPolling(binding, {
        now: Date.now(),
        projectId,
        subscription,
        userId,
      });
      broadcast(ctx, { type: "push-methods-changed" });
      return polling;
    }
    case "failed":
    case "queued":
    case "sent": {
      const isOk = outcome !== "failed";
      await noteSend(binding, subscription.id, { isOk, now: Date.parse(deps.now) });
      return null;
    }
  }
};

const isRetryTooSoon = async (
  deps: PoolDeps,
  notificationId: string,
  sessionId: string,
): Promise<boolean> => {
  const last = await latestAttempt(deps.db, notificationId, sessionId);
  return last?.reason === "failed" && Date.parse(deps.now) - Date.parse(last.attemptedAt) < 60_000;
};

/** One device by its push method, logged; nothing when it got this one already. */
const pushToDevice = async (
  deps: PoolDeps,
  message: PushMessage,
  subscription: PushSubscription,
): Promise<void> => {
  const transport = transportFor(deps.couriers.push, subscription.transport);
  const { notification } = message;
  if (
    (await wasDelivered(deps.db, notification.id, subscription.sessionId)) ||
    (await isRetryTooSoon(deps, notification.id, subscription.sessionId))
  ) {
    return;
  }
  if (transport === null || (await isBroken(deps.binding, transport, Date.now()))) {
    await logUnavailable(deps.db, { notificationId: notification.id, now: deps.now, subscription });
    return;
  }
  const address = {
    endpoint: subscription.endpoint,
    sessionHash: subscription.sessionHash,
    sessionId: subscription.sessionId,
  };
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
  const instead = await afterSend(deps, { outcome, subscription, transport });
  if (instead !== null) {
    // Not lost: this one goes the way the device gets them from now on.
    await pushToDevice(deps, message, instead);
  }
};

/**
Pushes to each device by its one push method (once per device: a retried alarm sends nothing
twice), logging every attempt. A dead device address drops its subscription until the app
registers again on its next start; credentials the method's provider refuses mark the method
broken for everyone, and open clients are told to choose again. There is never a fallback to
another method, so nothing arrives twice; only a device FCM can never reach from this server
(another Firebase project's token) is moved to polling, and gets this one that way.
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
there), and each phone's push method when the kind is on for the app. Delivered again (a pass
repeated after being cut short), it reaches only what it did not reach: Telegram once, each
device once; one resolved meanwhile goes nowhere. With a message to adopt, the Telegram copy is
that message edited into place; a retry after a failed first try sends a new one.
*/
export const deliverNew = async (
  deps: PoolDeps,
  stored: StoredNotification,
  options: NotifyOptions = {},
): Promise<void> => {
  const { notification } = stored;
  if (notification.resolvedAt !== null) {
    return;
  }
  if (stored.telegram.state === "pending" || stored.telegram.state === "failed") {
    const last = await latestAttempt(deps.db, notification.id, "telegram");
    if (last === undefined || Date.parse(deps.now) - Date.parse(last.attemptedAt) >= 60_000) {
      await sendToTelegram(deps, stored, options.adoptTelegramMessage);
    }
  }
  // Queued for polling devices before the open clients hear of it: an open app fetches at once.
  await pushToDevices(deps, notification);
  broadcast(deps.ctx, { notification, type: "notification" });
};

/** Open notifications whose latest copy failed and can be retried by a pool pass. */
export const hasSendRetry = async (
  deps: PoolDeps,
  stored: StoredNotification,
): Promise<boolean> => {
  if (stored.telegram.state === "failed") {
    return true;
  }
  if (deps.userId === undefined || !isChannelOn(deps.settings, stored.notification.kind, "app")) {
    return false;
  }
  const subscriptions = await subscriptionsOf(deps.binding, deps.userId, Date.parse(deps.now));
  const activeSessions = new Set(subscriptions.map((subscription) => subscription.sessionId));
  return await hasFailedCopy(deps.db, stored.notification.id, activeSessions);
};
