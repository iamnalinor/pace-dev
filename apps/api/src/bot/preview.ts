import {
  type BatchError,
  type EventInput,
  type Language,
  newId,
  planProposals,
  type Proposal,
  type Result,
  t,
} from "@pace/core";

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

/**
A preview waiting for its button: the text and, when it was understood, its proposals. They are
planned again on Accept, so the events are stamped then and checked against the state then.
*/
export type Pending = { readonly text: string; readonly proposals: null | readonly Proposal[] };

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

/** The events of every proposal as the bot writes them now, the text as a task's source. */
const planAll = (
  turn: Turn,
  { proposals, text }: { readonly text: string; readonly proposals: readonly Proposal[] },
): Result<readonly EventInput[], BatchError> =>
  planProposals(turn.state, proposals, {
    deviceTz: zoneOf(turn.state),
    newId: () => newId(),
    now: turn.now,
    source: "bot",
    sourceText: text,
  });

/** The proposals → the events they imply, kept until a button decides; the preview text. */
const previewOf = async (turn: Turn, text: string, read: ModelRead): Promise<BotReply> => {
  const { now, state, store } = turn;
  const { language } = state.settings;
  const canAccept =
    read.proposals.length > 0 && planAll(turn, { proposals: read.proposals, text }).ok;
  const id = newId();
  await store.remember(id, {
    proposals: canAccept ? [...read.proposals] : null,
    text,
  } satisfies Pending);
  if (!canAccept) {
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

/** Accept: the proposals planned now, over the state now, and written; `null` once done. */
const accept = async (
  turn: Turn,
  pending: { readonly text: string; readonly proposals: readonly Proposal[] },
): Promise<null | string> => {
  const planned = planAll(turn, pending);
  return planned.ok
    ? await applyInputs(turn, planned.value)
    : t(turn.state.settings.language, "bot.failed", { reason: planned.error.error });
};

/** A preview button: write what was understood, keep the text in the Inbox, or drop it. */
export const choosePreview = async (turn: Turn, action: string, id: string): Promise<BotReply> => {
  const { language } = turn.state.settings;
  const pending = (await turn.store.recall(id)) as Partial<Pending> | undefined;
  // A preview kept before this shape (or none at all) cannot be written any more.
  if (pending?.text === undefined || pending.proposals === undefined) {
    return plain(t(language, "bot.expired"));
  }
  if (action === PREVIEW_ACTIONS.cancel) {
    return plain(t(language, "bot.cancelled"));
  }
  if (action !== PREVIEW_ACTIONS.accept || pending.proposals === null) {
    const failure = await applyBodies(turn, [inboxBody(pending.text)]);
    return plain(failure ?? t(language, "bot.savedToInbox"));
  }
  return plain(
    (await accept(turn, { proposals: pending.proposals, text: pending.text })) ??
      t(language, "bot.done"),
  );
};
