import type { Db } from "../shared/db/d1.ts";

import { bindNonce, type NonceReply, peekNonce } from "./nonce.ts";
import { upsertTelegramUser } from "./users.ts";

/** Who opened the bot, as Telegram describes them. */
export type BotLoginUser = {
  readonly telegramId: string;
  readonly name: string;
  readonly firstName: string;
  readonly username: null | string;
};

export type BotLoginOutcome = "already-bound" | "not-found" | "ok";

const outcomeOf = (error: "nonce/already-bound" | "nonce/not-found"): BotLoginOutcome => {
  switch (error) {
    case "nonce/already-bound": {
      return "already-bound";
    }
    case "nonce/not-found": {
      return "not-found";
    }
  }
};

/** Whether the deep link's nonce can still be bound, before the bot replies to it. */
export const peekBotLogin =
  (db: Db) =>
  async (nonce: string): Promise<BotLoginOutcome> => {
    const peeked = await peekNonce(db, nonce, Date.now());
    return peeked.ok ? "ok" : outcomeOf(peeked.error);
  };

/**
The bot's side of the app login: the person exists from now on, the nonce points at them, and it
keeps the bot's reply (the login notice edits it into place once the app collects the nonce).
*/
export const bindBotLogin =
  (db: Db) =>
  async (botUser: BotLoginUser, nonce: string, reply: NonceReply): Promise<BotLoginOutcome> => {
    const now = Date.now();
    const user = await upsertTelegramUser(
      db,
      {
        name: botUser.name,
        firstName: botUser.firstName,
        photoUrl: undefined,
        telegramId: botUser.telegramId,
        username: botUser.username,
      },
      now,
    );
    const bound = await bindNonce(db, { nonce, now, reply, userId: user.id });
    return bound.ok ? "ok" : outcomeOf(bound.error);
  };
