import { type CoreState, type EventBody, type EventInput, newId, t } from "@pace/core";

import type { BotStoreApi } from "../shared/contract.ts";
import type { OutgoingMessage } from "../shared/telegram-api.ts";

import { clockIn } from "../shared/clock.ts";

/** A reply with its inline keyboard. */
export type BotReply = OutgoingMessage;

/** One bot update being handled: the user's store, their state and the instant. */
export type Turn = {
  readonly store: BotStoreApi;
  readonly state: CoreState;
  readonly now: string;
};

const BOT_DEVICE = "bot";

export const plain = (text: string): BotReply => ({ buttons: [], text });

/** The account zone; UTC until a device reported one. */
export const zoneOf = (state: CoreState): string => state.settings.timezone ?? "UTC";

/** `HH:MM` in the account zone and language. */
export const timeOf = (iso: string, state: CoreState): string =>
  clockIn(iso, state.settings.language, zoneOf(state));

const stampAll = (bodies: readonly EventBody[], now: string): readonly EventInput[] =>
  bodies.map((body) => ({ ...body, occurredAt: now, precision: "exact", source: "bot" }));

/** The text, kept verbatim as an Inbox item. */
export const inboxBody = (text: string): EventBody => ({
  payload: {
    fields: {},
    importance: "nice_to_have",
    presetId: "inbox",
    sourceText: text,
    subtasks: [],
    taskId: newId(),
    title: text,
  },
  type: "task.created",
});

/** Writes the events as the bot; `null` on success, otherwise the reason in the user's language. */
export const applyBodies = async (
  turn: Turn,
  bodies: readonly EventBody[],
): Promise<null | string> => {
  const result = await turn.store.apply(stampAll(bodies, turn.now), {
    deviceId: BOT_DEVICE,
    now: turn.now,
    source: "bot",
  });
  return result.ok
    ? null
    : t(turn.state.settings.language, "bot.failed", { reason: result.error.code });
};
