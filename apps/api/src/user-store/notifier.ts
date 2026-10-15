import { loadConfig } from "../shared/config.ts";
import { telegramFetch, type TelegramTarget } from "../shared/telegram-api.ts";
import { telegramIdOf } from "../shared/user-lookup.ts";

/** Storage key of the user's chat with the bot. */
const CHAT_KEY = "notify:chat";

/** The account zone wins; this only matters before any device reported one. */
export const SERVER_TZ = "UTC";

const chatOf = async (storage: DurableObjectStorage): Promise<string | undefined> =>
  await storage.get<string>(CHAT_KEY);

/**
Where Telegram messages go: the chat the bot stored, else the user's private chat, whose id
is the user's Telegram id (a wipe forgets the stored one). A chat found this way is stored
again, so D1 is asked once; a store with no user behind it has no chat.
*/
export const chatFor = async (
  storage: DurableObjectStorage,
  db: D1Database,
  userId: string | undefined,
): Promise<string | undefined> => {
  const stored = await chatOf(storage);
  if (stored !== undefined || userId === undefined) {
    return stored;
  }
  const telegramId = await telegramIdOf(db, userId);
  if (telegramId !== undefined) {
    await storage.put(CHAT_KEY, telegramId);
  }
  return telegramId;
};

export const setChat = async (storage: DurableObjectStorage, chatId: string): Promise<void> => {
  if ((await chatOf(storage)) !== chatId) {
    await storage.put(CHAT_KEY, chatId);
  }
};

/** The bot the store sends through; `null` when the Worker has no token configured. */
export const telegramOf = (env: object): null | TelegramTarget => {
  const config = loadConfig(env);
  if (!config.ok || config.value.telegramBotToken === undefined) {
    return null;
  }
  return {
    apiRoot: config.value.telegramApiRoot,
    fetch: telegramFetch,
    token: config.value.telegramBotToken,
  };
};

/** The web app's origin (links in messages); empty when the configuration cannot be read. */
export const webOriginOf = (env: object): string => {
  const config = loadConfig(env);
  return config.ok ? config.value.webOrigin : "";
};
