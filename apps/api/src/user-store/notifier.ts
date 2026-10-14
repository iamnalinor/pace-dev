import {
  type CoreState,
  evaluateNotifications,
  INITIAL_NOTIFY_MEMORY,
  nextAlarmAt,
  type NotifyDecision,
  type NotifyMemory,
  notifyPlan,
  type PlannedNotification,
  snooze,
} from "@pace/core";

import { loadConfig } from "../shared/config.ts";
import {
  telegramFetch,
  type TelegramTarget,
  wasTelegramMessageSent,
} from "../shared/telegram-api.ts";
import { telegramIdOf } from "../shared/user-lookup.ts";
import { notificationText } from "./notify-text.ts";

/** Storage keys of the notifier: the user's chat with the bot and what was already sent. */
const CHAT_KEY = "notify:chat";
const MEMORY_KEY = "notify:memory";

/** The account zone wins; this only matters before any device reported one. */
export const SERVER_TZ = "UTC";

export type NotifyRun = {
  readonly sent: number;
  readonly decisions: number;
  readonly nextAt: null | string;
};

export const chatOf = async (storage: DurableObjectStorage): Promise<string | undefined> =>
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

export const memoryOf = async (storage: DurableObjectStorage): Promise<NotifyMemory> =>
  (await storage.get<NotifyMemory>(MEMORY_KEY)) ?? INITIAL_NOTIFY_MEMORY;

export const saveMemory = async (
  storage: DurableObjectStorage,
  memory: NotifyMemory,
): Promise<void> => {
  await storage.put(MEMORY_KEY, memory);
};

/** Silences a task's alerts until `until`. */
export const snoozeTask = async (
  storage: DurableObjectStorage,
  taskId: string,
  until: string,
): Promise<void> => {
  await saveMemory(storage, snooze(await memoryOf(storage), taskId, until));
};

/** What the phone should schedule locally for the next day, as of `now`. */
export const planFor = async (
  storage: DurableObjectStorage,
  state: CoreState,
  now: string,
): Promise<readonly PlannedNotification[]> =>
  notifyPlan(state, { deviceTz: SERVER_TZ, now }, await memoryOf(storage));

/** Moves the alarm earlier when the state now calls for an earlier evaluation. */
export const rearm = async (
  storage: DurableObjectStorage,
  state: CoreState,
  now: string,
): Promise<void> => {
  const next = nextAlarmAt(state, { deviceTz: SERVER_TZ, now }, await memoryOf(storage));
  const existing = await storage.getAlarm();
  if (next !== null && (existing === null || Date.parse(next) < existing)) {
    await storage.setAlarm(Date.parse(next));
  }
};

export type NotifierRun = {
  readonly storage: DurableObjectStorage;
  readonly state: CoreState;
  readonly now: string;
  readonly chatId: string;
  readonly telegram: null | TelegramTarget;
  readonly log: (decisions: readonly NotifyDecision[]) => Promise<void>;
};

/**
One pass of the notifier: evaluates the rules, sends what is due to the chat, logs every
decision and arms the next alarm. Without a bot (`telegram` null) decisions are still logged.
*/
export const runNotifier = async (run: NotifierRun): Promise<NotifyRun> => {
  const { chatId, now, state, storage, telegram } = run;
  const evaluation = evaluateNotifications(
    state,
    { deviceTz: SERVER_TZ, now },
    await memoryOf(storage),
  );
  let sent = 0;
  for (const message of evaluation.messages) {
    const text = notificationText(message, state, now);
    if (telegram !== null && (await wasTelegramMessageSent(telegram, chatId, text))) {
      sent += 1;
    }
  }
  await run.log(evaluation.decisions);
  await saveMemory(storage, evaluation.memory);
  await (evaluation.nextAt === null
    ? storage.deleteAlarm()
    : storage.setAlarm(Date.parse(evaluation.nextAt)));
  return { decisions: evaluation.decisions.length, nextAt: evaluation.nextAt, sent };
};

/** The bot the alarm sends through; `null` when the Worker has no token configured. */
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
