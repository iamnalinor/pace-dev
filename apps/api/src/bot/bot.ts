import type { UserFromGetMe } from "grammy/types";

import { Bot, type Context, GrammyError } from "grammy";

import { createLogger } from "../shared/logger.ts";
import { type LoginFrom, readLoginPayload, returnUrl } from "../shared/login-link.ts";
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
  /** Whether the deep link's nonce can still be bound (it exists, unbound and unexpired). */
  readonly peekLogin: (nonce: string) => Promise<LoginOutcome>;
  /**
  Binds the login nonce from the deep link to the user who opened it, with the bot's reply to it
  (the login notice later edits that reply into place).
  */
  readonly bindLogin: (
    user: BotUser,
    nonce: string,
    reply: { readonly chatId: string; readonly messageId: number },
  ) => Promise<LoginOutcome>;
  /** Free text, `/now` and the preview buttons; without it the bot only handles login. */
  readonly assistant?: Assistant | undefined;
  readonly confirmAccount?:
    | ((
        telegramId: string,
        data: string,
      ) => Promise<{ readonly text: string; readonly isRefused?: true }>)
    | undefined;
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
  privateOnly: "Open the login link in your private chat with me.",
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

const answerAccountButton = async (
  ctx: Context,
  data: string,
  confirm: NonNullable<BotDeps["confirmAccount"]>,
): Promise<void> => {
  const answer = await confirm(String(ctx.from?.id ?? ""), data);
  if (answer.isRefused === true) {
    await ctx.answerCallbackQuery({ show_alert: true, text: answer.text });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(answer.text);
};

/** Telegram's refusal of an edit that would leave the message as it is (read by its body). */
const NOT_MODIFIED = "message is not modified";

const isNotModified = (error: unknown): boolean =>
  error instanceof GrammyError &&
  error.error_code === 400 &&
  error.description.includes(NOT_MODIFIED);

/**
Runs an edit; an edit refused because the message already shows exactly that (two presses at once
both edit to the same text) is what was wanted, so it counts as done.
*/
const editTolerantly = async (edit: () => Promise<unknown>): Promise<void> => {
  try {
    await edit();
  } catch (error) {
    if (!isNotModified(error)) {
      throw error;
    }
  }
};

/**
A refusal by Telegram that no redelivery can change (a 4xx other than rate limiting: a query too
old to answer, a message gone). The webhook answers 200 for it, logged, so Telegram does not
redeliver the update forever; anything else fails the webhook and Telegram retries it.
*/
const isPermanentRefusal = (error: unknown): boolean =>
  error instanceof GrammyError &&
  error.error_code >= 400 &&
  error.error_code < 500 &&
  error.error_code !== 429;

/**
What the pressed message becomes: a notification keeps its text with the answer below it (the
buttons go); a preview is replaced by the result. `null` when the notification shows that answer
already (a second press that raced the first one's edit): Telegram refuses an edit that changes
nothing, and nothing should change.
*/
const shownCallbackReply = (
  reply: BotReply,
  data: string,
  original: string | undefined,
): BotReply | null => {
  const isNotification = answerOfCode(data.slice(0, data.indexOf(":"))) !== undefined;
  if (!isNotification || original === undefined) {
    return reply;
  }
  const answered = `\n\n${reply.text}`;
  return original.endsWith(answered) ? null : { ...reply, text: `${original}${answered}` };
};

/**
Answers a button press and edits its message to show the reply; whether it edited it. Refused:
the message keeps its buttons to try again, the reason shows as an alert. A stale press, or one
whose message shows its answer already: the message stays, a toast says why nothing happened.
*/
const wasPressedMessageEdited = async (
  ctx: Context,
  reply: BotReply,
  data: string,
): Promise<boolean> => {
  if (reply.isRefused === true || reply.isToast === true) {
    await ctx.answerCallbackQuery({ show_alert: reply.isRefused === true, text: reply.text });
    return false;
  }
  const message = shownCallbackReply(reply, data, ctx.callbackQuery?.message?.text);
  if (message === null) {
    await ctx.answerCallbackQuery({ text: reply.text });
    return false;
  }
  await ctx.answerCallbackQuery();
  await editTolerantly(async () => {
    await ctx.editMessageText(...replyOf(message));
  });
  return true;
};

const attachAssistant = (
  bot: Bot,
  assistant: Assistant,
  confirmAccount: BotDeps["confirmAccount"],
): void => {
  bot.command("now", async (ctx) => {
    const reply = await assistant.now(String(ctx.from?.id ?? ""));
    await ctx.reply(...replyOf(reply));
  });
  bot.on("message:text", async (ctx) => {
    const telegramId = String(ctx.from.id);
    const reply = await assistant.message(
      telegramId,
      ctx.message.text,
      ctx.message.reply_to_message?.message_id,
    );
    const messageId = reply.editMessageId;
    if (messageId === undefined) {
      const sent = await ctx.reply(...replyOf(reply));
      if (reply.pendingId !== undefined) {
        await assistant.bindPreview(telegramId, reply.pendingId, sent.message_id);
      }
      return;
    }
    await ctx.api.editMessageText(ctx.chat.id, messageId, ...replyOf(reply));
    if (reply.pendingId !== undefined) {
      await assistant.bindPreview(telegramId, reply.pendingId, messageId);
    }
  });
  bot.on("callback_query:data", async (ctx) => {
    const { data } = ctx.callbackQuery;
    if (confirmAccount !== undefined && data.startsWith("account:")) {
      await answerAccountButton(ctx, data, confirmAccount);
      return;
    }
    const reply = await assistant.choose(String(ctx.from.id), data);
    const isEdited = await wasPressedMessageEdited(ctx, reply, data);
    const messageId = ctx.callbackQuery.message?.message_id;
    if (isEdited && messageId !== undefined && reply.pendingId !== undefined) {
      await assistant.bindPreview(String(ctx.from.id), reply.pendingId, messageId);
    }
  });
};

/**
A deep-link login at `/start`, in the person's private chat only: replied to first, bound after
with the reply's ids in the same write, so the login notice can take that reply over and the
person gets one message, not two.
A bind that fails after all (the link opened twice at once, or just expired) takes the reply back
to "expired".
*/
const startLogin = async (
  ctx: Context & { readonly chat: NonNullable<Context["chat"]> },
  deps: BotDeps,
  login: { readonly nonce: string; readonly from: LoginFrom },
): Promise<void> => {
  if (ctx.chat.type !== "private") {
    // Not bound: its notice would be edited into this chat, for every member to read.
    await ctx.reply(REPLIES.privateOnly);
    return;
  }
  const peeked = await deps.peekLogin(login.nonce);
  if (peeked !== "ok" || ctx.from === undefined) {
    await ctx.reply(loginReply(peeked === "ok" ? "not-found" : peeked));
    return;
  }
  const sent = await ctx.reply(
    loginReply(peeked),
    returnButton(returnUrl(deps.webOrigin, login.from)),
  );
  const outcome = await deps.bindLogin(toBotUser(ctx.from), login.nonce, {
    chatId: String(ctx.chat.id),
    messageId: sent.message_id,
  });
  if (outcome !== "ok") {
    await ctx.api.editMessageText(ctx.chat.id, sent.message_id, loginReply(outcome));
  }
};

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
  // First in the chain: grammY's own error handler only serves long polling, not webhooks.
  bot.use(async (_ctx, next) => {
    try {
      await next();
    } catch (error) {
      if (!isPermanentRefusal(error)) {
        throw error;
      }
      createLogger("info").warn("Telegram refused a bot reply for good", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    await startLogin(ctx, deps, login);
  });
  const { assistant } = deps;
  if (assistant !== undefined) {
    attachAssistant(bot, assistant, deps.confirmAccount);
  }
  return bot;
};
