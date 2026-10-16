import { type CoreState, type EventBody, type EventInput, t } from "@pace/core";

import type { BotStoreApi } from "../shared/contract.ts";
import type { OutgoingMessage } from "../shared/telegram-api.ts";

/**
A reply with its inline keyboard. `isRefused`: a button's answer that did not go through; the
message it came from stays as it was, buttons and all, to be tapped again.
*/
export type BotReply = OutgoingMessage & {
  readonly isRefused?: true;
  readonly pendingId?: string;
  readonly editMessageId?: number;
};

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

const stampAll = (bodies: readonly EventBody[], now: string): readonly EventInput[] =>
  bodies.map((body) => ({ ...body, occurredAt: now, precision: "exact", source: "bot" }));

/** Writes events as the bot; `null` on success, otherwise the reason in the user's language. */
export const applyInputs = async (
  turn: Turn,
  inputs: readonly EventInput[],
): Promise<null | string> => {
  const result = await turn.store.apply(inputs, {
    deviceId: BOT_DEVICE,
    now: turn.now,
    source: "bot",
  });
  return result.ok
    ? null
    : t(turn.state.settings.language, "bot.failed", { reason: result.error.code });
};

/** Writes the bodies as the bot, now. */
export const applyBodies = async (
  turn: Turn,
  bodies: readonly EventBody[],
): Promise<null | string> => await applyInputs(turn, stampAll(bodies, turn.now));
