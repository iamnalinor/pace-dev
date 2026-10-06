import type { Hono } from "hono";

import { webhookCallback } from "grammy";

import type { AppEnv } from "../shared/app-env.ts";
import type { TelegramTransport } from "./telegram-api.ts";

import { d1, type Db } from "../shared/db/d1.ts";
import { type BotDeps, createBot } from "./bot.ts";

/** What the bot needs from the rest of the Worker; `app.ts` composes it with the auth feature. */
export type BotRouteDeps = {
  readonly telegramFetch: TelegramTransport;
  readonly isAllowed: (telegramId: string, allowedIds: readonly string[]) => boolean;
  readonly bindLogin: (db: Db) => BotDeps["bindLogin"];
};

/** Telegram → bot: grammY checks `X-Telegram-Bot-Api-Secret-Token` (401 on mismatch). */
export const mountBotRoutes = (app: Hono<AppEnv>, deps: BotRouteDeps): void => {
  app.post("/telegram/webhook", async (c) => {
    const config = c.get("config");
    if (config.telegramBotToken === undefined || config.telegramWebhookSecret === undefined) {
      return c.json({ code: "bot/not-configured", message: "Telegram bot is not configured" }, 503);
    }
    const bot = createBot({
      apiRoot: config.telegramApiRoot,
      bindLogin: deps.bindLogin(d1(c.env.DB)),
      botInfo: config.botInfo,
      fetch: deps.telegramFetch,
      isAllowed: (telegramId) => deps.isAllowed(telegramId, config.allowedTelegramIds),
      token: config.telegramBotToken,
    });
    const handle = webhookCallback(bot, "cloudflare-mod", {
      secretToken: config.telegramWebhookSecret,
    });
    return await handle(c.req.raw);
  });
};
