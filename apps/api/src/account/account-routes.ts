import type { Context, Hono } from "hono";

import { and, eq } from "drizzle-orm";

import { endpoints, err, ok, t } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { Db } from "../shared/db/d1.ts";

import { reconcileAccountConfirmation } from "../shared/account-cleanup-reconciliation.ts";
import { requireUser } from "../shared/current-user.ts";
import { accountConfirmations } from "../shared/db/d1-schema.ts";
import { mount } from "../shared/mount.ts";
import { bearerOf, resolveSessionIdentity } from "../shared/session-identity.ts";
import {
  editTelegramMessage,
  sendTelegramMessage,
  type TelegramTarget,
  type TelegramTransport,
} from "../shared/telegram-api.ts";
import { deleteAccount } from "./delete-account.ts";

type Confirmation = typeof accountConfirmations.$inferSelect;
type VisibleStatus = "cancelled" | "confirmed" | "expired" | "pending" | "replaced";
const CONFIRM_MS = 5 * 60_000;

const telegramTarget = (c: Context<AppEnv>, fetch: TelegramTransport): null | TelegramTarget => {
  const config = c.get("config");
  return config.telegramBotToken === undefined
    ? null
    : { apiRoot: config.telegramApiRoot, token: config.telegramBotToken, fetch };
};

const visibleStatus = (row: Confirmation): VisibleStatus => {
  return row.status === "processing" ? "pending" : row.status;
};

export const expireConfirmation = async (binding: Db, row: Confirmation): Promise<Confirmation> => {
  if (row.status !== "pending" || row.expiresAt.getTime() > Date.now()) {
    return row;
  }
  const claimed = await binding
    .update(accountConfirmations)
    .set({ status: "expired" })
    .where(and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "pending")))
    .returning({ id: accountConfirmations.id });
  return claimed.length > 0
    ? { ...row, status: "expired" }
    : ((await binding.query.accountConfirmations.findFirst({
        where: eq(accountConfirmations.id, row.id),
      })) ?? row);
};

const confirmationOf = async (c: Context<AppEnv>, id: string): Promise<Confirmation | undefined> =>
  await c.env.DB.query.accountConfirmations.findFirst({
    where: eq(accountConfirmations.id, id),
  });

/**
The person a request is signed in as, if its bearer is a live sign-in. The status poll needs none:
after a deletion the app polls with a session that is gone, the unguessable id being the
capability. A live session of someone else is refused like an unknown id.
*/
const signedInCaller = async (c: Context<AppEnv>): Promise<string | undefined> => {
  const bearer = bearerOf(c.req.header("Authorization"));
  if (bearer === undefined) {
    return undefined;
  }
  const identity = await resolveSessionIdentity(c.env.DB, c.get("config"), {
    token: bearer,
    now: Date.now(),
  });
  return identity.ok ? identity.value.id : undefined;
};

const languageOf = async (c: Context<AppEnv>, userId: string): Promise<"en" | "ru"> => {
  const read = await c.env.USER_STORE.of(userId).read(new Date().toISOString());
  return read.state.settings.language;
};

const accountPrompt = (action: Confirmation["action"], language: "en" | "ru", id: string) => ({
  text: t(language, action === "wipe" ? "account.wipePrompt" : "account.deletePrompt"),
  buttons: [
    [
      { label: t(language, "account.confirm"), data: `account:confirm:${id}` },
      { label: t(language, "account.cancel"), data: `account:cancel:${id}` },
    ],
  ],
});

const replaceOlder = async (
  target: TelegramTarget,
  input: { readonly previous: readonly Confirmation[]; readonly language: "en" | "ru" },
): Promise<void> => {
  for (const row of input.previous) {
    if (row.messageId !== null) {
      await editTelegramMessage(target, {
        chatId: row.telegramId,
        messageId: row.messageId,
        text: t(input.language, "account.replaced"),
      });
    }
  }
};

const wasRequestDelivered = async (
  c: Context<AppEnv>,
  target: TelegramTarget,
  input: {
    readonly row: Confirmation;
    readonly language: "en" | "ru";
  },
): Promise<boolean> => {
  const { row, language } = input;
  const messageId = await sendTelegramMessage(
    target,
    row.telegramId,
    accountPrompt(row.action, language, row.id),
  );
  if (messageId === null) {
    return false;
  }
  const db = c.env.DB;
  const active = and(
    eq(accountConfirmations.userId, row.userId),
    eq(accountConfirmations.action, row.action),
    eq(accountConfirmations.status, "pending"),
  );
  const replaced = db
    .update(accountConfirmations)
    .set({ status: "replaced" })
    .where(active)
    .returning();
  const inserted = db.insert(accountConfirmations).values({ ...row, messageId });
  const [previous] = await db.batch([replaced, inserted]);
  await replaceOlder(target, { previous, language });
  return true;
};

const pendingConfirmation = (input: {
  readonly userId: string;
  readonly telegramId: string;
  readonly action: Confirmation["action"];
  readonly sessionId: string;
  readonly language: "en" | "ru";
}): Confirmation => {
  const now = new Date();
  const row: Confirmation = {
    id: crypto.randomUUID(),
    userId: input.userId,
    telegramId: input.telegramId,
    action: input.action,
    status: "pending",
    createdAt: now,
    expiresAt: new Date(now.getTime() + CONFIRM_MS),
    sessionId: input.sessionId,
    messageId: null,
    language: input.language,
  };
  return row;
};

const requestConfirmation = async (
  c: Context<AppEnv>,
  action: Confirmation["action"],
  fetch: TelegramTransport,
) => {
  const user = requireUser(c);
  const target = telegramTarget(c, fetch);
  if (target === null) {
    return err({
      status: 503 as const,
      code: "account/telegram-unavailable",
      message: "Telegram is unavailable",
    });
  }
  const sessionId = c.get("sessionId");
  if (sessionId === undefined) {
    return err({ status: 401 as const, code: "auth/unauthorized", message: "Session required" });
  }
  const language = await languageOf(c, user.id);
  const row = pendingConfirmation({
    userId: user.id,
    telegramId: user.telegramId,
    action,
    sessionId,
    language,
  });
  if (!(await wasRequestDelivered(c, target, { row, language }))) {
    return err({
      status: 409 as const,
      code: "account/no-telegram",
      message: "Open the bot once, then try again",
    });
  }
  return ok({ id: row.id, expiresAt: row.expiresAt.toISOString() });
};

type Answer = { readonly text: string; readonly isRefused?: true };

/** Only one callback can move a still-pending confirmation to its next state. */
const wasPendingClaimed = async (
  c: Context<AppEnv>,
  row: Confirmation,
  status: "cancelled" | "processing",
): Promise<boolean> => {
  const claimed = await c.env.DB.update(accountConfirmations)
    .set({ status })
    .where(and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "pending")))
    .returning({ id: accountConfirmations.id });
  return claimed.length > 0;
};

const cancelFromBot = async (
  c: Context<AppEnv>,
  row: Confirmation,
  language: "en" | "ru",
): Promise<Answer> => {
  return (await wasPendingClaimed(c, row, "cancelled"))
    ? { text: t(language, "account.cancelled") }
    : { text: t(language, "account.alreadyHandled"), isRefused: true };
};

const confirmFromBot = async (
  c: Context<AppEnv>,
  row: Confirmation,
  language: "en" | "ru",
): Promise<Answer> => {
  if (row.status !== "processing" && !(await wasPendingClaimed(c, row, "processing"))) {
    return { text: t(language, "account.alreadyHandled"), isRefused: true };
  }
  const result = await reconcileAccountConfirmation(c.env, row);
  if (!result.ok) {
    return { text: t(language, "account.failed"), isRefused: true };
  }
  // Pending (more archive objects than one pass deletes): an alert keeps the buttons to press again.
  return result.value.status === "complete"
    ? { text: t(language, row.action === "wipe" ? "account.wiped" : "account.deleted") }
    : { text: t(language, "account.inProgress"), isRefused: true };
};

const handledConfirmation = (row: Confirmation, language: "en" | "ru"): Answer => ({
  text: t(language, row.status === "expired" ? "account.expired" : "account.alreadyHandled"),
  isRefused: true,
});

/**
The language the request was made in. A row from before it was kept falls back to the store's,
readable only while the request is still pending (fenced or wiped after).
*/
const replyLanguage = async (c: Context<AppEnv>, row: Confirmation): Promise<"en" | "ru"> =>
  row.language ?? (row.status === "pending" ? await languageOf(c, row.userId) : "en");

/** The callback identity comes from Telegram's signed webhook update, never the callback data. */
export const answerAccountConfirmation = async (
  c: Context<AppEnv>,
  telegramId: string,
  data: string,
): Promise<Answer> => {
  const match = /^account:(confirm|cancel):([\da-f-]{36})$/u.exec(data);
  if (match === null) {
    return { text: t("en", "account.unknown"), isRefused: true };
  }
  const raw = await confirmationOf(c, match[2] ?? "");
  if (raw?.telegramId !== telegramId) {
    return { text: t("en", "account.notYours"), isRefused: true };
  }
  const row = await expireConfirmation(c.env.DB, raw);
  const language = await replyLanguage(c, row);
  if (row.status === "processing" && match[1] === "confirm") {
    return await confirmFromBot(c, row, language);
  }
  if (row.status !== "pending") {
    return handledConfirmation(row, language);
  }
  return match[1] === "cancel"
    ? await cancelFromBot(c, row, language)
    : await confirmFromBot(c, row, language);
};

export const mountAccountRoutes = (app: Hono<AppEnv>, fetch: TelegramTransport): void => {
  mount(
    app,
    endpoints.account.createConfirmation,
    async ({ c, body }) => await requestConfirmation(c, body.action, fetch),
  );
  mount(app, endpoints.account.confirmationStatus, async ({ c, params }) => {
    let row = await confirmationOf(c, params.id);
    const caller = await signedInCaller(c);
    if (caller !== undefined && row?.userId !== caller) {
      row = undefined;
    }
    if (row?.status === "processing") {
      await reconcileAccountConfirmation(c.env, row);
      row = await confirmationOf(c, params.id);
    }
    return row === undefined
      ? err({
          status: 404,
          code: "account/unknown-confirmation",
          message: "Confirmation not found",
        })
      : ok({ status: visibleStatus(await expireConfirmation(c.env.DB, row)) });
  });
  mount(app, endpoints.account.cancelConfirmation, async ({ c, params }) => {
    const row = await confirmationOf(c, params.id);
    if (row?.userId !== requireUser(c).id) {
      return err({
        status: 404,
        code: "account/unknown-confirmation",
        message: "Confirmation not found",
      });
    }
    const current = await expireConfirmation(c.env.DB, row);
    if (current.status === "pending") {
      const isClaimed = await wasPendingClaimed(c, row, "cancelled");
      return ok({
        status: isClaimed
          ? ("cancelled" as const)
          : visibleStatus((await confirmationOf(c, row.id)) ?? current),
      });
    }
    return ok({ status: visibleStatus(current) });
  });
  mount(app, endpoints.account.testReset, async ({ c }) => {
    if (c.get("config").environment !== "test") {
      return err({ status: 404, code: "not-found", message: "Not found" });
    }
    const result = await deleteAccount(c, requireUser(c).id);
    return result.ok && result.value.status === "complete"
      ? ok({ deleted: true as const })
      : err({ status: 503 as const, code: "internal", message: "Account cleanup is pending" });
  });
};
