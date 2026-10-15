import type { UserFromGetMe } from "grammy/types";

import { Bot, type Context } from "grammy";

import { readLoginPayload, returnUrl } from "../shared/login-link.ts";
import { inlineKeyboardButton, type TelegramTransport } from "../shared/telegram-api.ts";
import { answerOfCode, type Assistant, type BotReply } from "./assistant.ts";

/** Who opened the bot, as the login flow needs them. */
export type BotUser = {
  readonly telegramId: string;
  readonly name: string;
  readonly firstName: string;
  readonly username: null | string;
};

export type LoginOutcome = "already-bound" | "not-found" | "ok";

export type BotDeps = {
  readonly token: string;
  /** From `getMe`; when given, grammY never calls Telegram on cold start. */
  readonly botInfo?: undefined | UserFromGetMe;
  readonly apiRoot?: string | undefined;
  readonly fetch: TelegramTransport;
  readonly isAllowed: (telegramId: string) => boolean;
  /** Binds the login nonce from the deep link to the user who opened it. */
  readonly bindLogin: (user: BotUser, nonce: string) => Promise<LoginOutcome>;
  /** Free text, `/now` and the preview buttons; without it the bot only handles login. */
  readonly assistant?: Assistant | undefined;
  /** The website: "Return to Pace" after a login leads to it or to the app's App Link there. */
  readonly webOrigin: string;
};

/** A button back to where the login started (the app's App Link or the website), if any. */
const returnButton = (url: string | undefined) =>
  url === undefined
    ? {}
    : { reply_markup: { inline_keyboard: [[{ text: REPLIES.returnToPace, url }]] } };

export const REPLIES = {
  loggedIn: "Logged in. Return to Pace.",
  returnToPace: "Return to Pace",
  notAllowed: "Not allowed",
  linkExpired: "This login link has expired. Open Pace and try again.",
  welcome: "Hi! This is the Pace bot. Log in from the app to connect it.",
} as const;

const toBotUser = (from: NonNullable<Context["from"]>): BotUser => ({
  telegramId: String(from.id),
  name: [from.first_name, from.last_name].filter(Boolean).join(" "),
  firstName: from.first_name,
  username: from.username ?? null,
});

const loginReply = (outcome: LoginOutcome): string => {
  switch (outcome) {
    case "ok": {
      return REPLIES.loggedIn;
    }
    case "already-bound":
    case "not-found": {
      return REPLIES.linkExpired;
    }
  }
};

/** A reply with its inline keyboard, as `ctx.reply` takes it. */
const replyOf = (
  reply: BotReply,
): [
  string,
  { reply_markup?: { inline_keyboard: ReturnType<typeof inlineKeyboardButton>[][] } },
] => [
  reply.text,
  reply.buttons.length === 0
    ? {}
    : {
        reply_markup: {
          inline_keyboard: reply.buttons.map((row) =>
            row.map((button) => inlineKeyboardButton(button)),
          ),
        },
      },
];

/** A grammY bot built per request (Workers have no long-lived state). */
export const createBot = (deps: BotDeps): Bot => {
  const bot = new Bot(deps.token, {
    ...(deps.botInfo !== undefined && { botInfo: deps.botInfo }),
    client: {
      ...(deps.apiRoot !== undefined && { apiRoot: deps.apiRoot }),
      // grammY types the option as the platform's global fetch (Bun's adds `preconnect`); it only ever calls it.
      fetch: deps.fetch as typeof fetch,
    },
  });
  bot.use(async (ctx, next) => {
    if (ctx.from === undefined) {
      return;
    }
    if (!deps.isAllowed(String(ctx.from.id))) {
      await ctx.reply(REPLIES.notAllowed);
      return;
    }
    await next();
  });
  bot.command("start", async (ctx) => {
    const login = readLoginPayload(ctx.match);
    if (login === undefined || ctx.from === undefined) {
      await ctx.reply(REPLIES.welcome);
      return;
    }
    const outcome = await deps.bindLogin(toBotUser(ctx.from), login.nonce);
    if (outcome !== "ok") {
      await ctx.reply(loginReply(outcome));
      return;
    }
    await ctx.reply(loginReply(outcome), returnButton(returnUrl(deps.webOrigin, login.from)));
  });
  const { assistant } = deps;
  if (assistant !== undefined) {
    bot.command("now", async (ctx) => {
      const reply = await assistant.now(String(ctx.from?.id ?? ""));
      await ctx.reply(...replyOf(reply));
    });
    bot.on("message:text", async (ctx) => {
      const reply = await assistant.message(String(ctx.from.id), ctx.message.text);
      await ctx.reply(...replyOf(reply));
    });
    bot.on("callback_query:data", async (ctx) => {
      const { data } = ctx.callbackQuery;
      const reply = await assistant.choose(String(ctx.from.id), data);
      if (reply.isRefused === true) {
        // Refused: the message keeps its buttons to try again; the reason shows as an alert.
        await ctx.answerCallbackQuery({ show_alert: true, text: reply.text });
        return;
      }
      await ctx.answerCallbackQuery();
      // A notification keeps its text (the buttons go away); a preview is replaced by the result.
      const original = ctx.callbackQuery.message?.text;
      const isNotification = answerOfCode(data.slice(0, data.indexOf(":"))) !== undefined;
      await ctx.editMessageText(
        isNotification && original !== undefined ? `${original}\n\n${reply.text}` : reply.text,
      );
    });
  }
  return bot;
};
