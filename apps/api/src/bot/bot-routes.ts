import type { Hono } from "hono";

import { webhookCallback } from "grammy";

import type { ParseProvider } from "../parse/llm.ts";
import type { AppEnv } from "../shared/app-env.ts";
import type { Config } from "../shared/config.ts";
import type { TelegramTransport } from "../shared/telegram-api.ts";

import { findUserIdByTelegramId } from "../auth/users.ts";
import { d1, type Db } from "../shared/db/d1.ts";
import { isIpInCidrs } from "../shared/ip.ts";
import { createLogger } from "../shared/logger.ts";
import { createAssistant } from "./assistant.ts";
import { type BotDeps, createBot } from "./bot.ts";

/** What the bot needs from the rest of the Worker; `app.ts` composes it with the auth feature. */
export type BotRouteDeps = {
  readonly telegramFetch: TelegramTransport;
  readonly isAllowed: (telegramId: string, allowedIds: readonly string[]) => boolean;
  readonly bindLogin: (db: Db) => BotDeps["bindLogin"];
  readonly parseProviders: (config: Config) => readonly ParseProvider[];
};

/**
Telegram → bot. Two gates before an update reaches grammY: the caller must come from one
of Telegram's subnets (`CF-Connecting-IP` is set by Cloudflare itself, so a client cannot
forge it; 403 otherwise) and must echo `X-Telegram-Bot-Api-Secret-Token` (401 on mismatch).
*/
export const mountBotRoutes = (app: Hono<AppEnv>, deps: BotRouteDeps): void => {
  app.post("/telegram/webhook", async (c) => {
    const config = c.get("config");
    const cidrs = config.telegramWebhookAllowedCidrs;
    const ip = c.req.header("CF-Connecting-IP");
    if (cidrs.length > 0 && (ip === undefined || !isIpInCidrs(ip, cidrs))) {
      createLogger("info").warn("Telegram webhook called from outside the allowed subnets", {
        ip: ip ?? null,
      });
      return c.json(
        { code: "bot/forbidden-ip", message: "Webhook calls are accepted from Telegram only" },
        403,
      );
    }
    if (config.telegramBotToken === undefined || config.telegramWebhookSecret === undefined) {
      return c.json({ code: "bot/not-configured", message: "Telegram bot is not configured" }, 503);
    }
    const db = d1(c.env.DB);
    const storeOf = (userId: string) => c.env.USER_STORE.get(c.env.USER_STORE.idFromName(userId));
    const bindLogin = deps.bindLogin(db);
    const bot = createBot({
      apiRoot: config.telegramApiRoot,
      // Logging in through the bot also opens the chat notifications go to.
      bindLogin: async (user, nonce) => {
        const outcome = await bindLogin(user, nonce);
        const userId = outcome === "ok" ? await findUserIdByTelegramId(db, user.telegramId) : null;
        if (userId !== null) {
          await storeOf(userId).notifyTo(user.telegramId, new Date().toISOString());
        }
        return outcome;
      },
      botInfo: config.botInfo,
      fetch: deps.telegramFetch,
      assistant: createAssistant({
        now: () => new Date().toISOString(),
        providers: deps.parseProviders(config),
        storeOf,
        userIdOf: async (telegramId) => await findUserIdByTelegramId(db, telegramId),
      }),
      isAllowed: (telegramId) => deps.isAllowed(telegramId, config.allowedTelegramIds),
      token: config.telegramBotToken,
    });
    const handle = webhookCallback(bot, "cloudflare-mod", {
      secretToken: config.telegramWebhookSecret,
    });
    return await handle(c.req.raw);
  });
};
