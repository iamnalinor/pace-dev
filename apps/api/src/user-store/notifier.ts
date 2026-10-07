import {
  type CoreState,
  evaluateNotifications,
  INITIAL_NOTIFY_MEMORY,
  nextAlarmAt,
  type NotifyDecision,
  type NotifyMemory,
} from "@pace/core";

import { loadConfig } from "../shared/config.ts";
import {
  telegramFetch,
  type TelegramTarget,
  wasTelegramMessageSent,
} from "../shared/telegram-api.ts";
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

/** Moves the alarm earlier when the state now calls for an earlier evaluation. */
export const rearm = async (
  storage: DurableObjectStorage,
  state: CoreState,
  now: string,
): Promise<void> => {
  if ((await chatOf(storage)) === undefined) {
    return;
  }
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
