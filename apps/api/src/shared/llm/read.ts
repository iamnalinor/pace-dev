import {
  accountTz,
  type Action,
  actionContext,
  actionsByRules,
  actionsFromModel,
  type CoreState,
  domainByRules,
  type ModelOutput,
  type ParseDomain,
  type ParseQuestion,
  type ParseRequestBody,
  type QueryContext,
  type Rejected,
  type RequestDomain,
  type Result,
  RULES_CONFIDENCE,
  withSummary,
} from "@pace/core";

import { type Cooldowns, type LlmError, type ParseProvider, runParse } from "./llm.ts";
import { buildParsePrompt } from "./prompt.ts";

/** What a message is about and what to do with it, each action with its summary. */
export type Reading = {
  readonly domain: ParseDomain;
  readonly confidence: number;
  readonly actions: readonly Action[];
};

/** The model's reading, checked against the message and the lists it was shown. */
export type ModelRead = Reading & {
  readonly provider: string;
  readonly questions: readonly ParseQuestion[];
  /** What the model answered, for the decision log. */
  readonly output: ModelOutput;
  /** Its actions left out: an unknown alias, an unquoted delete, another domain. */
  readonly rejected: readonly Rejected[];
  readonly limited: Cooldowns;
};

type World = { readonly state: CoreState; readonly now: string };

const ctxOf = ({ now, state }: World): QueryContext => ({
  deviceTz: state.settings.timezone ?? "UTC",
  now,
});

const summaryWorld = (world: World) => ({
  language: world.state.settings.language,
  now: world.now,
  state: world.state,
  zone: accountTz(world.state, ctxOf(world)),
});

/**
Reads a message with the first model that answers: the prompt shows the open tasks and recent
activities under aliases, the answer is mapped back through them and checked against the text,
and each action gets its summary. Nothing is written.
*/
export const readMessage = async (
  providers: readonly ParseProvider[],
  text: string,
  options: World & {
    readonly domain: RequestDomain;
    readonly cooldowns: Cooldowns;
    readonly clock?: () => number;
    readonly thread?: ParseRequestBody["thread"];
  },
): Promise<Result<ModelRead, LlmError>> => {
  const { cooldowns, domain, state } = options;
  const ctx = ctxOf(options);
  const context = actionContext(state, ctx);
  const prompt = buildParsePrompt(text, {
    context,
    ctx,
    domain,
    language: state.settings.language,
    state,
    ...(options.thread !== undefined && { thread: options.thread }),
  });
  const answer = await runParse(providers, prompt, {
    cooldowns,
    ...(options.clock !== undefined && { now: options.clock }),
  });
  if (!answer.ok) {
    return answer;
  }
  const output = answer.value.result;
  const read = domain === "auto" ? output.domain : domain;
  const thread = options.thread ?? [];
  const { readings, rejected } = actionsFromModel(output, {
    context,
    ctx,
    domain: read,
    evidence: [...thread.map((turn) => turn.text), text].join("\n"),
    state,
    // A revision is still of the first request: corrections only steer the model.
    text: thread[0]?.text ?? text,
  });
  const world = summaryWorld(options);
  return {
    ok: true,
    value: {
      confidence: domain === "auto" ? output.confidence : 1,
      domain: read,
      limited: answer.value.limited,
      output,
      actions: readings.map((reading) => withSummary(reading.body, reading.doubtful, world)),
      provider: answer.value.provider,
      questions: output.questions,
      rejected,
    },
  };
};

/**
The rules' reading when no model can answer: a new task, or the activity a typed span says.
Asked to decide, the rules guess, never sure enough to skip asking.
*/
export const readByRules = (text: string, domain: RequestDomain, world: World): Reading => {
  const ctx = ctxOf(world);
  const read = domain === "auto" ? domainByRules(text, { ctx, state: world.state }) : domain;
  const summary = summaryWorld(world);
  return {
    confidence: domain === "auto" ? RULES_CONFIDENCE : 1,
    domain: read,
    actions: actionsByRules(text, read, { ctx, state: world.state }).map((body) =>
      withSummary(body, [], summary),
    ),
  };
};
