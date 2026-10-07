import { addMinutesIso, nextDigestAt, nowList, t } from "@pace/core";

import type { ParseProvider } from "../shared/llm/llm.ts";

import { type BotStoreApi, NOTIFY_ACTIONS } from "../shared/contract.ts";
import { choosePreview, preview } from "./preview.ts";
import { applyBodies, type BotReply, plain, timeOf, type Turn, zoneOf } from "./turn.ts";

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

/** A snooze without any digest window ahead lasts this long. */
const SNOOZE_FALLBACK_MINUTES = 3 * 60;
const NOW_ROWS = 5;

const NOTIFY_ACTION_CODES: readonly string[] = Object.values(NOTIFY_ACTIONS);

/** A notification button: snooze the task's alerts until the next digest, or close it from the chat. */
const notificationAction = async (
  turn: Turn,
  action: string,
  taskId: string,
): Promise<BotReply> => {
  const { now, state } = turn;
  const { language } = state.settings;
  if (action === NOTIFY_ACTIONS.snooze) {
    const until =
      nextDigestAt(now, zoneOf(state), state.settings) ??
      addMinutesIso(now, SNOOZE_FALLBACK_MINUTES);
    await turn.store.snoozeTask(taskId, until, now);
    return plain(t(language, "notify.snoozed", { time: timeOf(until, state) }));
  }
  const isDone = action === NOTIFY_ACTIONS.done;
  const failure = await applyBodies(turn, [
    { payload: { outcome: isDone ? "done" : "cancelled", taskId }, type: "task.closed" },
  ]);
  return plain(failure ?? t(language, isDone ? "notify.closedDone" : "notify.closedCancelled"));
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
        return NOTIFY_ACTION_CODES.includes(action)
          ? await notificationAction(turn, action, id)
          : await choosePreview(turn, action, id);
      }),
    message: async (telegramId, text) =>
      await withUser(telegramId, async (turn) => await preview(turn, deps.providers, text)),
    now: async (telegramId) => await withUser(telegramId, nowReply),
  };
};
