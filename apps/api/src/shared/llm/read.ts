import {
  accountTz,
  type CoreState,
  domainByRules,
  type ModelOutput,
  type ParseDomain,
  type ParseQuestion,
  type Proposal,
  proposalContext,
  proposalsByRules,
  proposalsFromModel,
  type QueryContext,
  type Rejected,
  type RequestDomain,
  type Result,
  RULES_CONFIDENCE,
  withSummary,
} from "@pace/core";

import { type Cooldowns, type LlmError, type ParseProvider, runParse } from "./llm.ts";
import { buildParsePrompt } from "./prompt.ts";

/** What a message is about and what to do with it, each proposal with its summary. */
export type Reading = {
  readonly domain: ParseDomain;
  readonly confidence: number;
  readonly proposals: readonly Proposal[];
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
and each proposal gets its summary. Nothing is written.
*/
export const readMessage = async (
  providers: readonly ParseProvider[],
  text: string,
  options: World & {
    readonly domain: RequestDomain;
    readonly cooldowns: Cooldowns;
    readonly clock?: () => number;
  },
): Promise<Result<ModelRead, LlmError>> => {
  const { cooldowns, domain, state } = options;
  const ctx = ctxOf(options);
  const context = proposalContext(state, ctx);
  const prompt = buildParsePrompt(text, {
    context,
    ctx,
    domain,
    language: state.settings.language,
    state,
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
  const { readings, rejected } = proposalsFromModel(output, {
    context,
    ctx,
    domain: read,
    state,
    text,
  });
  const world = summaryWorld(options);
  return {
    ok: true,
    value: {
      confidence: domain === "auto" ? output.confidence : 1,
      domain: read,
      limited: answer.value.limited,
      output,
      proposals: readings.map((reading) => withSummary(reading.body, reading.doubtful, world)),
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
    proposals: proposalsByRules(text, read, { ctx, state: world.state }).map((body) =>
      withSummary(body, [], summary),
    ),
  };
};
