import { type Answer, nowList, t } from "@pace/core";

import type { ParseProvider } from "../shared/llm/llm.ts";

import { type BotStoreApi, POOL_ACTIONS } from "../shared/contract.ts";
import { choosePreview, preview } from "./preview.ts";
import { type BotReply, plain, type Turn, zoneOf } from "./turn.ts";

export type { BotReply } from "./turn.ts";

export type AssistantDeps = {
  /** The Pace user behind a Telegram account, if they ever logged in through the bot. */
  readonly userIdOf: (telegramId: string) => Promise<null | string>;
  readonly storeOf: (userId: string) => BotStoreApi;
  readonly providers: readonly ParseProvider[];
  readonly now: () => string;
};

export type Assistant = {
  readonly now: (telegramId: string) => Promise<BotReply>;
  readonly message: (telegramId: string, text: string) => Promise<BotReply>;
  readonly choose: (telegramId: string, data: string) => Promise<BotReply>;
};

const NOW_ROWS = 5;

/** The answer a notification button's code stands for; `undefined` for any other button. */
export const answerOfCode = (code: string): Answer | undefined =>
  (Object.entries(POOL_ACTIONS) as [Answer, string][]).find(([, value]) => value === code)?.[0];

/**
A notification button: the same answer as from the app or the web (the store writes it and
takes the notification back elsewhere); the reply is what the message gains below its text.
*/
const notificationAnswer = async (turn: Turn, answer: Answer, id: string): Promise<BotReply> => {
  const { language } = turn.state.settings;
  const result = await turn.store.resolveNotification(id, answer, {
    now: turn.now,
    origin: "telegram",
  });
  return plain(
    result.ok
      ? t(language, `notify.resolved.${result.value.resolution ?? "read"}`)
      : t(language, "bot.failed", { reason: result.error.code }),
  );
};

/** The top of Now as a short numbered list. */
const nowReply = ({ now, state }: Turn): BotReply => {
  const { language } = state.settings;
  const titles = nowList(state, { deviceTz: zoneOf(state), now })
    .items.slice(0, NOW_ROWS)
    .map((item, index) => `${String(index + 1)}. ${item.task.title}`);
  return plain(
    titles.length === 0
      ? t(language, "bot.nowEmpty")
      : [t(language, "bot.nowTitle"), ...titles].join("\n"),
  );
};

/** `<action>:<id>`; ids may contain colons themselves (homework instances do). */
const splitData = (data: string): { readonly action: string; readonly id: string } => {
  const split = data.indexOf(":");
  return split === -1
    ? { action: "", id: data }
    : { action: data.slice(0, split), id: data.slice(split + 1) };
};

/** The bot's conversation: free text → a preview with buttons; a button writes it. */
export const createAssistant = (deps: AssistantDeps): Assistant => {
  const withUser = async (
    telegramId: string,
    run: (turn: Turn) => BotReply | Promise<BotReply>,
  ): Promise<BotReply> => {
    const userId = await deps.userIdOf(telegramId);
    if (userId === null) {
      return plain(t("en", "bot.notLinked"));
    }
    const store = deps.storeOf(userId);
    const now = deps.now();
    // Every conversation tells the store where the user's notifications go.
    await store.notifyTo(telegramId, now);
    const { state } = await store.read(now);
    return await run({ now, state, store });
  };

  return {
    choose: async (telegramId, data) =>
      await withUser(telegramId, async (turn) => {
        const { action, id } = splitData(data);
        const answer = answerOfCode(action);
        return answer === undefined
          ? await choosePreview(turn, action, id)
          : await notificationAnswer(turn, answer, id);
      }),
    message: async (telegramId, text) =>
      await withUser(telegramId, async (turn) => await preview(turn, deps.providers, text)),
    now: async (telegramId) => await withUser(telegramId, nowReply),
  };
};
