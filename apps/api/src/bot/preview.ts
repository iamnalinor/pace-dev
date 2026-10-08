import {
  type EventBody,
  type Language,
  newId,
  openInstanceOf,
  planParse,
  type QueryContext,
  quickInputBodies,
  t,
  type VerifiedParse,
  verifyParse,
} from "@pace/core";

import { inboxBody } from "../shared/inbox.ts";
import { parseDecision } from "../shared/llm/decision.ts";
import { type ParseProvider, runParse } from "../shared/llm/llm.ts";
import { buildParsePrompt } from "../shared/llm/prompt.ts";
import { describePlan } from "./describe.ts";
import { applyBodies, type BotReply, plain, timeOf, type Turn, zoneOf } from "./turn.ts";

/** A preview waiting for its button: the text and, when it was understood, what to write. */
export type Pending = { readonly text: string; readonly bodies: null | readonly EventBody[] };

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

type Reading = {
  readonly text: string;
  readonly verified: VerifiedParse;
  readonly ctx: QueryContext;
};

/** A checked reading → the events it implies, kept until a button decides; the preview text. */
const previewOf = async (turn: Turn, { ctx, text, verified }: Reading): Promise<BotReply> => {
  const { now, state, store } = turn;
  const { language } = state.settings;
  const plan = planParse(verified, text, { ctx, state });
  const id = newId();
  if (!plan.ok) {
    await store.remember(id, { bodies: null, text } satisfies Pending);
    return { buttons: buttonsFor(id, language, false), text: t(language, "bot.notUnderstood") };
  }
  const bodies =
    plan.value.kind === "update"
      ? plan.value.bodies
      : quickInputBodies(plan.value.input, { now, state }, newId);
  await store.remember(id, { bodies, text } satisfies Pending);
  const instance =
    plan.value.kind === "create"
      ? openInstanceOf(state, plan.value.input.presetId, now)
      : undefined;
  return {
    buttons: buttonsFor(id, language, true),
    text: describePlan(plan.value, {
      doubtful: verified.doubtful,
      instanceTitle: instance?.title ?? null,
      language,
      questions: verified.result.questions.map((question) => question.question),
      state,
    }),
  };
};

/** Free text → the LLM's reading, checked against the text, shown with Accept / To Inbox / Cancel. */
export const preview = async (
  turn: Turn,
  providers: readonly ParseProvider[],
  text: string,
): Promise<BotReply> => {
  const { now, state } = turn;
  const ctx = { deviceTz: zoneOf(state), now };
  const prompt = buildParsePrompt(text, { ctx, language: state.settings.language, state });
  const answer = await runParse(providers, prompt, {
    cooldowns: await turn.store.llmCooldowns(now),
  });
  await turn.store.noteLlmLimits(answer.ok ? answer.value.limited : answer.error.limited, now);
  if (!answer.ok) {
    return await unavailable(turn, text, answer.error.retryAt);
  }
  const projectNames = Object.values(state.projects.byId).map((project) => project.name);
  const verified = verifyParse(answer.value.result, { projectNames, source: text });
  const { doubtful, result } = verified;
  await turn.store.logDecisions(
    [
      parseDecision(text, "bot", {
        doubtful,
        provider: answer.value.provider,
        result,
        status: "parsed",
      }),
    ],
    now,
  );
  return await previewOf(turn, { ctx, text, verified });
};

/** A preview button: write what was understood, keep the text in the Inbox, or drop it. */
export const choosePreview = async (turn: Turn, action: string, id: string): Promise<BotReply> => {
  const { language } = turn.state.settings;
  const pending = (await turn.store.recall(id)) as Pending | undefined;
  if (pending === undefined) {
    return plain(t(language, "bot.expired"));
  }
  if (action === PREVIEW_ACTIONS.cancel) {
    return plain(t(language, "bot.cancelled"));
  }
  const accepted = action === PREVIEW_ACTIONS.accept ? pending.bodies : null;
  const failure = await applyBodies(turn, accepted ?? [inboxBody(pending.text)]);
  return plain(failure ?? t(language, accepted === null ? "bot.savedToInbox" : "bot.done"));
};
