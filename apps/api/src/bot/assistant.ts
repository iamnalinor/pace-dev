import { type Answer, nowList, t } from "@pace/core";

import type { ParseProvider } from "../shared/llm/llm.ts";

import { type BotStoreApi, POOL_ACTIONS } from "../shared/contract.ts";
import { choosePreview, followupPreview, preview } from "./preview.ts";
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
  readonly message: (telegramId: string, text: string, replyTo?: number) => Promise<BotReply>;
  readonly choose: (telegramId: string, data: string) => Promise<BotReply>;
  readonly bindPreview: (telegramId: string, id: string, messageId: number) => Promise<void>;
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
  return result.ok
    ? plain(t(language, `notify.resolved.${result.value.resolution ?? "read"}`))
    : { ...plain(t(language, "bot.failed", { reason: result.error.code })), isRefused: true };
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
    bindPreview: async (telegramId, id, messageId) => {
      const userId = await deps.userIdOf(telegramId);
      if (userId === null) {
        return;
      }
      const store = deps.storeOf(userId);
      const binding = { id, messageId };
      await store.remember(`bot:message:${String(messageId)}`, binding);
      await store.remember("bot:latest", binding);
    },
    choose: async (telegramId, data) =>
      await withUser(telegramId, async (turn) => {
        const { action, id } = splitData(data);
        const answer = answerOfCode(action);
        return answer === undefined
          ? await choosePreview(turn, deps.providers, { action, id })
          : await notificationAnswer(turn, answer, id);
      }),
    message: async (telegramId, text, replyTo) =>
      await withUser(telegramId, async (turn) => {
        const key = replyTo === undefined ? "bot:latest" : `bot:message:${String(replyTo)}`;
        const binding = (await turn.store.peek(key)) as
          | undefined
          | { readonly id?: string; readonly messageId?: number };
        if (binding?.id !== undefined && binding.messageId !== undefined) {
          const revised = await followupPreview(turn, deps.providers, { id: binding.id, text });
          if (revised !== null) {
            return revised.pendingId === undefined
              ? revised
              : { ...revised, editMessageId: binding.messageId };
          }
        }
        return await preview(turn, deps.providers, text);
      }),
    now: async (telegramId) => await withUser(telegramId, nowReply),
  };
};
