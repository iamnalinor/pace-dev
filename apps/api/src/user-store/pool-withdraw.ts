import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { eq } from "drizzle-orm";

import type { Resolution } from "@pace/core";

import type { AnswerOrigin } from "../shared/contract.ts";
import type { PoolDeps } from "./notification-pool.ts";

import { transportFor } from "../shared/push/registry.ts";
import { deleteTelegramMessage } from "../shared/telegram-api.ts";
import {
  latestAttempt,
  markDismissed,
  pendingDismissalIds,
  takeBackDeliveries,
} from "./delivery-rows.ts";
import { broadcast } from "./live-sockets.ts";
import {
  markTelegramKept,
  markTelegramUndismissable,
  type StoredNotification,
} from "./pool-rows.ts";
import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

const markDismissalTerminal = async (db: Db, id: number, reason: string): Promise<void> => {
  await db
    .update(schema.notificationDeliveries)
    .set({ reason: `dismissal-${reason}` })
    .where(eq(schema.notificationDeliveries.id, id));
};

/**
Deletes the Telegram copy, unless the answer came from Telegram (the bot edits it there and the
message stays). Whether the copy is gone: only then does the log mark it taken back.
*/
const telegramDeletionOutcome = async (
  deps: PoolDeps,
  telegram: StoredNotification["telegram"],
  origin: AnswerOrigin,
): Promise<"deleted" | "retry" | "skip" | "terminal" | "unavailable"> => {
  const { chatId, messageId, state } = telegram;
  if (origin === "telegram" || state !== "sent") {
    return "skip";
  }
  const target = deps.couriers.telegram;
  if (target === null) {
    return "unavailable";
  }
  return chatId === null || messageId === null
    ? "terminal"
    : await deleteTelegramMessage(target, chatId, messageId);
};

const wasTelegramDeleted = async (
  deps: PoolDeps,
  stored: StoredNotification,
  origin: AnswerOrigin,
): Promise<boolean> => {
  const { notification, telegram } = stored;
  if (origin === "telegram" && telegram.state === "sent") {
    await markTelegramKept(deps.db, notification.id);
  }
  const outcome = await telegramDeletionOutcome(deps, telegram, origin);
  if (outcome === "terminal" || outcome === "unavailable") {
    await markTelegramUndismissable(deps.db, notification.id);
    const attempt = await latestAttempt(deps.db, notification.id, "telegram");
    if (attempt !== undefined) {
      await markDismissalTerminal(
        deps.db,
        attempt.id,
        outcome === "terminal" ? "refused" : outcome,
      );
    }
  }
  return outcome === "deleted";
};

const withdrawCopies = async (
  deps: PoolDeps,
  stored: StoredNotification,
  isTelegramGone: boolean,
): Promise<void> => {
  const id = stored.notification.id;
  const copies = await takeBackDeliveries(deps.db, id, { isTelegramGone });
  for (const copy of copies) {
    if (copy.method === "telegram") {
      await markDismissed(deps.db, copy.id, deps.now);
      continue;
    }
    const transport = transportFor(deps.couriers.push, copy.method);
    if (transport === null) {
      await markDismissalTerminal(deps.db, copy.id, "unavailable");
      continue;
    }
    const outcome = await transport.dismiss(copy, id);
    if (["sent", "queued", "gone"].includes(outcome)) {
      await markDismissed(deps.db, copy.id, deps.now);
    } else if (outcome === "incompatible" || outcome === "unavailable") {
      await markDismissalTerminal(deps.db, copy.id, outcome);
    }
  }
};

/**
Takes a resolved notification back everywhere: the Telegram copy is deleted unless the answer
came from Telegram (the bot edits it there), every push copy is dismissed through the method
that delivered it, and open clients update their feed.
*/
export const hasPendingAfterWithdraw = async (
  deps: PoolDeps,
  stored: StoredNotification,
  { origin, resolution }: { readonly origin: AnswerOrigin; readonly resolution: Resolution },
): Promise<boolean> => {
  const isTelegramGone = await wasTelegramDeleted(deps, stored, origin);
  await withdrawCopies(deps, stored, isTelegramGone);
  broadcast(deps.ctx, { id: stored.notification.id, resolution, type: "dismiss" });
  return await hasPendingDismissal(deps.db, stored.notification.id);
};

const hasPendingDismissal = async (db: Db, notificationId: string): Promise<boolean> => {
  const pending = await pendingDismissalIds(db);
  return pending.includes(notificationId);
};
