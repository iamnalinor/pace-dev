import { type EventInput, type Language, newId, planProposal, type Proposal, t } from "@pace/core";

import type { ParseProvider } from "../shared/llm/llm.ts";

import { inboxBody } from "../shared/inbox.ts";
import { parseDecision } from "../shared/llm/decision.ts";
import { type ModelRead, readMessage } from "../shared/llm/read.ts";
import { describeProposals } from "./describe.ts";
import {
  applyBodies,
  applyInputs,
  type BotReply,
  plain,
  timeOf,
  type Turn,
  zoneOf,
} from "./turn.ts";

/** A preview waiting for its button: the text and, when it was understood, what to write. */
export type Pending = { readonly text: string; readonly inputs: null | readonly EventInput[] };

/** Callback data of the preview buttons: `<action>:<preview id>`. */
export const PREVIEW_ACTIONS = { accept: "a", cancel: "c", inbox: "i" } as const;

const buttonsFor = (id: string, language: Language, canAccept: boolean): BotReply["buttons"] => [
  [
    ...(canAccept
      ? [{ data: `${PREVIEW_ACTIONS.accept}:${id}`, label: t(language, "bot.accept") }]
      : []),
    { data: `${PREVIEW_ACTIONS.inbox}:${id}`, label: t(language, "bot.toInbox") },
    { data: `${PREVIEW_ACTIONS.cancel}:${id}`, label: t(language, "bot.cancel") },
  ],
];

/**
No model answers: the text waits in the store and is read (and written) once one is back,
with a message then; the reply says when to expect that.
*/
const unavailable = async (turn: Turn, text: string, retryAt: null | string): Promise<BotReply> => {
  const { language } = turn.state.settings;
  await turn.store.logDecisions(
    [parseDecision(text, "bot", { retryAt, status: "unavailable" })],
    turn.now,
  );
  await turn.store.enqueueParse({ channel: "bot", retryAt, text }, turn.now);
  return plain(
    retryAt === null
      ? t(language, "bot.unavailableSoon")
      : t(language, "bot.unavailable", { time: timeOf(retryAt, turn.state) }),
  );
};

/** The events of every proposal, as the bot writes them; `null` when one cannot be planned. */
const planAll = (turn: Turn, proposals: readonly Proposal[]): null | readonly EventInput[] => {
  const ctx = {
    deviceTz: zoneOf(turn.state),
    newId: () => newId(),
    now: turn.now,
    source: "bot" as const,
  };
  const inputs: EventInput[] = [];
  for (const proposal of proposals) {
    const planned = planProposal(turn.state, proposal, ctx);
    if (!planned.ok) {
      return null;
    }
    inputs.push(...planned.value);
  }
  return inputs;
};

/** The proposals → the events they imply, kept until a button decides; the preview text. */
const previewOf = async (turn: Turn, text: string, read: ModelRead): Promise<BotReply> => {
  const { now, state, store } = turn;
  const { language } = state.settings;
  const inputs = read.proposals.length === 0 ? null : planAll(turn, read.proposals);
  const id = newId();
  await store.remember(id, { inputs, text } satisfies Pending);
  if (inputs === null) {
    return { buttons: buttonsFor(id, language, false), text: t(language, "bot.notUnderstood") };
  }
  return {
    buttons: buttonsFor(id, language, true),
    text: describeProposals(read.proposals, {
      language,
      now,
      questions: read.questions.map((question) => question.question),
      state,
    }),
  };
};

/** Free text → the assistant's proposals, checked against the text, shown with Accept / To Inbox / Cancel. */
export const preview = async (
  turn: Turn,
  providers: readonly ParseProvider[],
  text: string,
): Promise<BotReply> => {
  const { now, state } = turn;
  const read = await readMessage(providers, text, {
    cooldowns: await turn.store.llmCooldowns(now),
    domain: "task",
    now,
    state,
  });
  await turn.store.noteLlmLimits(read.ok ? read.value.limited : read.error.limited, now);
  if (!read.ok) {
    return await unavailable(turn, text, read.error.retryAt);
  }
  const { output, proposals, provider, rejected } = read.value;
  await turn.store.logDecisions(
    [parseDecision(text, "bot", { output, proposals, provider, rejected, status: "parsed" })],
    now,
  );
  return await previewOf(turn, text, read.value);
};

/** A preview button: write what was understood, keep the text in the Inbox, or drop it. */
export const choosePreview = async (turn: Turn, action: string, id: string): Promise<BotReply> => {
  const { language } = turn.state.settings;
  const pending = (await turn.store.recall(id)) as Partial<Pending> | undefined;
  // A preview kept before this shape (or none at all) cannot be written any more.
  if (pending?.text === undefined || pending.inputs === undefined) {
    return plain(t(language, "bot.expired"));
  }
  if (action === PREVIEW_ACTIONS.cancel) {
    return plain(t(language, "bot.cancelled"));
  }
  const accepted = action === PREVIEW_ACTIONS.accept ? pending.inputs : null;
  const failure =
    accepted === null
      ? await applyBodies(turn, [inboxBody(pending.text)])
      : await applyInputs(turn, accepted);
  return plain(failure ?? t(language, accepted === null ? "bot.savedToInbox" : "bot.done"));
};
