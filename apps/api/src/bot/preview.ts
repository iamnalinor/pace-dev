import {
  type Action,
  type BatchError,
  CLASSIFY_CONFIDENT,
  type EventInput,
  type Language,
  newId,
  type ParseRequestBody,
  planActions,
  type Result,
  t,
} from "@pace/core";

import type { ParseProvider } from "../shared/llm/llm.ts";

import { inboxBody } from "../shared/inbox.ts";
import { parseDecision } from "../shared/llm/decision.ts";
import { type ModelRead, readMessage } from "../shared/llm/read.ts";
import { describeActions } from "./describe.ts";
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
A preview waiting for its button: the text and, when it was understood, its actions. They are
planned again on Accept, so the events are stamped then and checked against the state then.
*/
export type Pending = {
  readonly text: string;
  readonly actions: null | readonly Action[];
  readonly domain: "activity" | "task";
  readonly thread: NonNullable<ParseRequestBody["thread"]>;
  readonly awaitingChoice: boolean;
};

/** Callback data of the preview buttons: `<action>:<preview id>`. */
export const PREVIEW_ACTIONS = {
  accept: "a",
  activity: "v",
  cancel: "c",
  inbox: "i",
  task: "t",
} as const;

const buttonsFor = (
  id: string,
  language: Language,
  { canAccept, canInbox }: { readonly canAccept: boolean; readonly canInbox: boolean },
): BotReply["buttons"] => [
  [
    ...(canAccept
      ? [{ data: `${PREVIEW_ACTIONS.accept}:${id}`, label: t(language, "bot.accept") }]
      : []),
    ...(canInbox
      ? [{ data: `${PREVIEW_ACTIONS.inbox}:${id}`, label: t(language, "bot.toInbox") }]
      : []),
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

/** The events of every action as the bot writes them now, the text as a task's source. */
const planAll = (
  turn: Turn,
  { actions, text }: { readonly text: string; readonly actions: readonly Action[] },
): Result<readonly EventInput[], BatchError> =>
  planActions(turn.state, actions, {
    deviceTz: zoneOf(turn.state),
    newId: () => newId(),
    now: turn.now,
    source: "bot",
    sourceText: text,
  });

/** The actions → the events they imply, kept until a button decides; the preview text. */
const previewOf = async (
  turn: Turn,
  {
    text,
    read,
    thread = [],
  }: {
    readonly text: string;
    readonly read: ModelRead;
    readonly thread?: NonNullable<ParseRequestBody["thread"]>;
  },
): Promise<BotReply> => {
  const { now, state, store } = turn;
  const { language } = state.settings;
  const canAccept = read.actions.length > 0 && planAll(turn, { actions: read.actions, text }).ok;
  const id = newId();
  const isNeedsChoice = read.confidence < CLASSIFY_CONFIDENT;
  await store.remember(id, {
    actions: canAccept ? [...read.actions] : null,
    domain: read.domain,
    text,
    thread,
    awaitingChoice: isNeedsChoice,
  } satisfies Pending);
  if (isNeedsChoice) {
    return {
      buttons: [
        [
          { data: `${PREVIEW_ACTIONS.task}:${id}`, label: t(language, "bot.domainTask") },
          { data: `${PREVIEW_ACTIONS.activity}:${id}`, label: t(language, "bot.domainActivity") },
          { data: `${PREVIEW_ACTIONS.cancel}:${id}`, label: t(language, "bot.cancel") },
        ],
      ],
      text: t(language, read.domain === "task" ? "bot.readAsTask" : "bot.readAsActivity"),
      pendingId: id,
    };
  }
  if (!canAccept) {
    return {
      buttons: buttonsFor(id, language, { canAccept: false, canInbox: read.domain === "task" }),
      text: t(language, "bot.notUnderstood"),
      pendingId: id,
    };
  }
  return {
    buttons: buttonsFor(id, language, {
      canAccept: true,
      canInbox: read.domain === "task" && read.actions.some((item) => item.kind === "task.create"),
    }),
    pendingId: id,
    text: describeActions(read.actions, {
      language,
      now,
      questions: read.questions.map((question) => question.question),
      state,
    }),
  };
};

/** Free text → the assistant's actions, checked against the text, shown with Accept / To Inbox / Cancel. */
export const preview = async (
  turn: Turn,
  providers: readonly ParseProvider[],
  text: string,
): Promise<BotReply> => {
  const { now, state } = turn;
  const read = await readMessage(providers, text, {
    cooldowns: await turn.store.llmCooldowns(now),
    domain: "auto",
    now,
    state,
  });
  await turn.store.noteLlmLimits(read.ok ? read.value.limited : read.error.limited, now);
  if (!read.ok) {
    return await unavailable(turn, text, read.error.retryAt);
  }
  const { output, actions, provider, rejected } = read.value;
  await turn.store.logDecisions(
    [parseDecision(text, "bot", { output, actions, provider, rejected, status: "parsed" })],
    now,
  );
  return await previewOf(turn, { text, read: read.value });
};

/** A new chat message revises a still pending answer, with its entire earlier thread. */
export const followupPreview = async (
  turn: Turn,
  providers: readonly ParseProvider[],
  { id, text }: { readonly id: string; readonly text: string },
): Promise<BotReply | null> => {
  const pending = (await turn.store.peek(id)) as Partial<Pending> | undefined;
  if (
    pending?.text === undefined ||
    pending.domain === undefined ||
    pending.actions === undefined ||
    pending.actions === null
  ) {
    return null;
  }
  const thread = [...(pending.thread ?? []), { text: pending.text, actions: [...pending.actions] }];
  if (thread.length > 5) {
    return plain(t(turn.state.settings.language, "bot.tooManyCorrections"));
  }
  const read = await readMessage(providers, text, {
    cooldowns: await turn.store.llmCooldowns(turn.now),
    domain: pending.domain,
    now: turn.now,
    state: turn.state,
    thread,
  });
  await turn.store.noteLlmLimits(read.ok ? read.value.limited : read.error.limited, turn.now);
  if (!read.ok) {
    return plain(t(turn.state.settings.language, "bot.correctionUnavailable"));
  }
  const { output, actions, provider, rejected } = read.value;
  await turn.store.logDecisions(
    [parseDecision(text, "bot", { output, actions, provider, rejected, status: "parsed" })],
    turn.now,
  );
  const reply = await previewOf(turn, { text, read: read.value, thread });
  await turn.store.recall(id);
  return reply;
};

/** Accept: the actions planned now, over the state now, and written; `null` once done. */
const accept = async (
  turn: Turn,
  pending: { readonly text: string; readonly actions: readonly Action[] },
): Promise<null | string> => {
  const planned = planAll(turn, pending);
  return planned.ok
    ? await applyInputs(turn, planned.value)
    : t(turn.state.settings.language, "bot.failed", { reason: planned.error.error });
};

/** A preview button: write what was understood, keep the text in the Inbox, or drop it. */
const chooseDomain = async (
  turn: Turn,
  providers: readonly ParseProvider[],
  { pending, domain }: { readonly pending: Pending; readonly domain: "activity" | "task" },
): Promise<BotReply> => {
  const read = await readMessage(providers, pending.text, {
    cooldowns: await turn.store.llmCooldowns(turn.now),
    domain,
    now: turn.now,
    state: turn.state,
  });
  await turn.store.noteLlmLimits(read.ok ? read.value.limited : read.error.limited, turn.now);
  return read.ok
    ? await previewOf(turn, { text: pending.text, read: read.value, thread: pending.thread })
    : await unavailable(turn, pending.text, read.error.retryAt);
};

const finishPreview = async (turn: Turn, pending: Pending, action: string): Promise<BotReply> => {
  const { language } = turn.state.settings;
  if (action === PREVIEW_ACTIONS.inbox && pending.domain === "task") {
    const failure = await applyBodies(turn, [inboxBody(pending.text)]);
    return plain(failure ?? t(language, "bot.savedToInbox"));
  }
  if (action !== PREVIEW_ACTIONS.accept || pending.actions === null || pending.awaitingChoice) {
    return plain(t(language, "bot.expired"));
  }
  const failure = await accept(turn, { actions: pending.actions, text: pending.text });
  return plain(failure ?? t(language, "bot.done"));
};

/** A preview button: write what was understood, keep the text in the Inbox, or drop it. */
export const choosePreview = async (
  turn: Turn,
  providers: readonly ParseProvider[],
  { action, id }: { readonly action: string; readonly id: string },
): Promise<BotReply> => {
  const { language } = turn.state.settings;
  const pending = (await turn.store.recall(id)) as Partial<Pending> | undefined;
  // A preview kept before this shape (or none at all) cannot be written any more.
  if (pending?.text === undefined || pending.actions === undefined) {
    return plain(t(language, "bot.expired"));
  }
  if (action === PREVIEW_ACTIONS.cancel) {
    return plain(t(language, "bot.cancelled"));
  }
  if (action === PREVIEW_ACTIONS.task || action === PREVIEW_ACTIONS.activity) {
    const domain = action === PREVIEW_ACTIONS.task ? "task" : "activity";
    return await chooseDomain(turn, providers, { pending: pending as Pending, domain });
  }
  return await finishPreview(turn, pending as Pending, action);
};
