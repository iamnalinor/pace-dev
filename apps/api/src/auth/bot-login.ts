import type { Db } from "../shared/db/d1.ts";

import { bindNonce } from "./nonce.ts";
import { upsertTelegramUser } from "./users.ts";

/** Who opened the bot, as Telegram describes them. */
export type BotLoginUser = {
  readonly telegramId: string;
  readonly name: string;
  readonly username: null | string;
};

export type BotLoginOutcome = "already-bound" | "not-found" | "ok";

/** The bot's side of the app login: the person exists from now on, the nonce points at them. */
export const bindBotLogin =
  (db: Db) =>
  async (botUser: BotLoginUser, nonce: string): Promise<BotLoginOutcome> => {
    const now = Date.now();
    const user = await upsertTelegramUser(
      db,
      {
        name: botUser.name,
        photoUrl: undefined,
        telegramId: botUser.telegramId,
        username: botUser.username,
      },
      now,
    );
    const bound = await bindNonce(db, { nonce, now, userId: user.id });
    if (bound.ok) {
      return "ok";
    }
    switch (bound.error) {
      case "nonce/already-bound": {
        return "already-bound";
      }
      case "nonce/not-found": {
        return "not-found";
      }
    }
  };
