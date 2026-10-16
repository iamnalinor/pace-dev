import type { Context, Hono } from "hono";

import { and, eq } from "drizzle-orm";

import { endpoints, err, ok, t } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { requireUser } from "../shared/current-user.ts";
import { accountConfirmations } from "../shared/db/d1-schema.ts";
import { d1 } from "../shared/db/d1.ts";
import { mount } from "../shared/mount.ts";
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

const expire = async (c: Context<AppEnv>, row: Confirmation): Promise<Confirmation> => {
  if (row.status !== "pending" || row.expiresAt.getTime() > Date.now()) {
    return row;
  }
  await d1(c.env.DB)
    .update(accountConfirmations)
    .set({ status: "expired" })
    .where(and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "pending")));
  return { ...row, status: "expired" };
};

const confirmationOf = async (c: Context<AppEnv>, id: string): Promise<Confirmation | undefined> =>
  await d1(c.env.DB).query.accountConfirmations.findFirst({
    where: eq(accountConfirmations.id, id),
  });

const languageOf = async (c: Context<AppEnv>, userId: string): Promise<"en" | "ru"> => {
  const read = await c.env.USER_STORE.get(c.env.USER_STORE.idFromName(userId)).read(
    new Date().toISOString(),
  );
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

const previousRequests = async (
  c: Context<AppEnv>,
  userId: string,
  action: Confirmation["action"],
): Promise<readonly Confirmation[]> =>
  await d1(c.env.DB).query.accountConfirmations.findMany({
    where: and(
      eq(accountConfirmations.userId, userId),
      eq(accountConfirmations.action, action),
      eq(accountConfirmations.status, "pending"),
    ),
  });

const replaceOlder = async (
  c: Context<AppEnv>,
  target: TelegramTarget,
  input: { readonly previous: readonly Confirmation[]; readonly language: "en" | "ru" },
): Promise<void> => {
  for (const row of input.previous) {
    await d1(c.env.DB)
      .update(accountConfirmations)
      .set({ status: "replaced" })
      .where(and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "pending")));
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
    readonly previous: readonly Confirmation[];
  },
): Promise<boolean> => {
  const { row, language, previous } = input;
  const messageId = await sendTelegramMessage(
    target,
    row.telegramId,
    accountPrompt(row.action, language, row.id),
  );
  if (messageId === null) {
    await d1(c.env.DB).delete(accountConfirmations).where(eq(accountConfirmations.id, row.id));
    return false;
  }
  await d1(c.env.DB)
    .update(accountConfirmations)
    .set({ messageId })
    .where(eq(accountConfirmations.id, row.id));
  await replaceOlder(c, target, { previous, language });
  return true;
};

const insertPending = async (
  c: Context<AppEnv>,
  input: {
    readonly userId: string;
    readonly telegramId: string;
    readonly action: Confirmation["action"];
    readonly sessionId: string;
  },
): Promise<Confirmation> => {
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
  };
  await d1(c.env.DB).insert(accountConfirmations).values(row);
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
  const previous = await previousRequests(c, user.id, action);
  const row = await insertPending(c, {
    userId: user.id,
    telegramId: user.telegramId,
    action,
    sessionId,
  });
  if (!(await wasRequestDelivered(c, target, { row, language, previous }))) {
    return err({
      status: 409 as const,
      code: "account/no-telegram",
      message: "Open the bot once, then try again",
    });
  }
  return ok({ id: row.id, expiresAt: row.expiresAt.toISOString() });
};

type Answer = { readonly text: string; readonly isRefused?: true };

const cancelFromBot = async (
  c: Context<AppEnv>,
  row: Confirmation,
  language: "en" | "ru",
): Promise<Answer> => {
  await d1(c.env.DB)
    .update(accountConfirmations)
    .set({ status: "cancelled" })
    .where(and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "pending")));
  return { text: t(language, "account.cancelled") };
};

const performConfirmedAction = async (c: Context<AppEnv>, row: Confirmation): Promise<void> => {
  if (row.action === "wipe") {
    await c.env.USER_STORE.get(c.env.USER_STORE.idFromName(row.userId)).wipe();
  } else {
    await deleteAccount(c, row.userId);
  }
};

const confirmFromBot = async (
  c: Context<AppEnv>,
  row: Confirmation,
  language: "en" | "ru",
): Promise<Answer> => {
  const claimed = await d1(c.env.DB)
    .update(accountConfirmations)
    .set({ status: "processing" })
    .where(and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "pending")))
    .returning({ id: accountConfirmations.id });
  if (claimed.length === 0) {
    return { text: t(language, "account.alreadyHandled"), isRefused: true };
  }
  try {
    await performConfirmedAction(c, row);
    await d1(c.env.DB)
      .update(accountConfirmations)
      .set({ status: "confirmed" })
      .where(eq(accountConfirmations.id, row.id));
    return { text: t(language, row.action === "wipe" ? "account.wiped" : "account.deleted") };
  } catch {
    await d1(c.env.DB)
      .update(accountConfirmations)
      .set({ status: "pending" })
      .where(
        and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "processing")),
      );
    return { text: t(language, "account.failed"), isRefused: true };
  }
};

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
  const row = await expire(c, raw);
  const language =
    row.status === "confirmed" && row.action === "delete" ? "en" : await languageOf(c, row.userId);
  if (row.status !== "pending") {
    return {
      text: t(language, row.status === "expired" ? "account.expired" : "account.alreadyHandled"),
      isRefused: true,
    };
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
    const row = await confirmationOf(c, params.id);
    return row === undefined
      ? err({
          status: 404,
          code: "account/unknown-confirmation",
          message: "Confirmation not found",
        })
      : ok({ status: visibleStatus(await expire(c, row)) });
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
    const current = await expire(c, row);
    if (current.status === "pending") {
      await d1(c.env.DB)
        .update(accountConfirmations)
        .set({ status: "cancelled" })
        .where(
          and(eq(accountConfirmations.id, row.id), eq(accountConfirmations.status, "pending")),
        );
      return ok({ status: "cancelled" as const });
    }
    return ok({ status: visibleStatus(current) });
  });
  mount(app, endpoints.account.testReset, async ({ c }) => {
    if (c.get("config").environment !== "test") {
      return err({ status: 404, code: "not-found", message: "Not found" });
    }
    await deleteAccount(c, requireUser(c).id);
    return ok({ deleted: true as const });
  });
};
