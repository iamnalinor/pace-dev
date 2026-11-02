import type { z } from "zod";

import {
  type generateText,
  jsonSchema,
  type JSONSchema7,
  type LanguageModel,
  NoObjectGeneratedError,
  Output,
  type Schema,
  streamText,
  zodSchema,
} from "ai";

import { err, type ModelOutput, ModelOutputSchema, ok, type Result } from "@pace/core";

import type { ParsePrompt } from "./prompt.ts";

import { createLogger } from "../logger.ts";
import { isSchemaRefusal, messageOf, refusedAnswers, retryAtOf } from "./failure.ts";
import { hedgedRace, type Lost, type Won } from "./race.ts";
import { clampToJsonSchema, fillAbsent, lenientJsonSchema } from "./schema-fit.ts";

const log = createLogger("info");

/** One model the parser may use, tried in order. */
export type ParseProvider = {
  readonly name: string;
  readonly model: LanguageModel;
  readonly providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];
};

/** Provider name → when it takes requests again (ISO), as its rate limit said. */
export type Cooldowns = Readonly<Record<string, string>>;

export type LlmError = {
  readonly code: "llm/invalid-output" | "llm/unavailable";
  /** When a provider said it will take requests again (ISO), if any did. */
  readonly retryAt: null | string;
  /** The providers this call found rate limited, to skip until then. */
  readonly limited: Cooldowns;
};

/** A structured answer: what the model said, which provider said it, the limits met on the way. */
export type Answer<T> = {
  readonly result: T;
  readonly provider: string;
  readonly limited: Cooldowns;
};

export type ParseAnswer = Answer<ModelOutput>;

type RunOptions = {
  readonly cooldowns?: Cooldowns;
  readonly now?: () => number;
  /** How long a provider may stay silent (no first token) before the next one is asked too. */
  readonly hedgeAfterMs?: number;
  /** How long one provider may take in all before it counts as failed. */
  readonly giveUpAfterMs?: number;
  /** The whole read gives up after this long (the bot answers Telegram within 10 s). */
  readonly deadlineMs?: number;
};

/** Time to first token after which the next provider is asked in parallel. */
export const HEDGE_AFTER_MS = 5000;
/** One provider's whole answer may take this long; a hung stream must not hold the request. */
export const GIVE_UP_AFTER_MS = 45_000;

const earliest = (a: null | string, b: null | string): null | string => {
  if (a === null) {
    return b;
  }
  return b === null || a <= b ? a : b;
};

/** Available while some provider is not cooling down; otherwise the soonest one back. */
export const availability = (
  names: readonly string[],
  cooldowns: Cooldowns,
  now: string,
): { readonly available: boolean; readonly retryAt: null | string } => {
  const cooling = names
    .map((name) => cooldowns[name])
    .filter((at): at is string => at !== undefined && at > now)
    .toSorted((a, b) => a.localeCompare(b));
  const isAvailable = names.length > cooling.length;
  return { available: isAvailable, retryAt: isAvailable ? null : (cooling.at(0) ?? null) };
};

/**
What a model's answer must pass, the one check for every way an answer arrives (the stream, or an
endpoint's refusal that carries it): the keys left out filled as "does not apply", the values
clamped to the limits, then all of `schema`.
*/
type AnswerCheck<T> = {
  /** What the model is shown: the schema without length limits, its answer checked by `check`. */
  readonly shown: Schema<T>;
  readonly check: (value: unknown) => Promise<z.ZodSafeParseResult<T>>;
};

const answerCheck = <T>(schema: z.ZodType<T>): AnswerCheck<T> => {
  const strict = zodSchema(schema).jsonSchema;
  const check = async (value: unknown): Promise<z.ZodSafeParseResult<T>> => {
    const filled = fillAbsent(value, await strict);
    const clamped = clampToJsonSchema(filled, await strict);
    if (JSON.stringify(filled) !== JSON.stringify(value)) {
      log.info("llm: keys the answer left out read as empty");
    }
    if (JSON.stringify(clamped) !== JSON.stringify(filled)) {
      log.info("llm: answer cut to the schema's limits");
    }
    return schema.safeParse(clamped);
  };
  const shown = jsonSchema<T>(async () => lenientJsonSchema(await strict) as JSONSchema7, {
    validate: async (value) => {
      const parsed = await check(value);
      return parsed.success
        ? { success: true, value: parsed.data }
        : { error: parsed.error, success: false };
    },
  });
  return { check, shown };
};

/** Stream parts that mean the model has started answering. */
const FIRST_TOKEN_PARTS: ReadonlySet<string> = new Set([
  "reasoning-delta",
  "text-delta",
  "tool-input-delta",
]);

type Failure =
  | { readonly kind: "failed"; readonly retryAt: null | string; readonly message: string }
  | { readonly kind: "invalid"; readonly message: string };

const parsedJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
A failed call as the race sees it. An endpoint that refused its own model's answer on its schema
check (bug class 85) is read for that answer, which our check may still take; failing that, the
answer was out of shape, never a provider down.
*/
const failedAnswer = async <T>(
  error: unknown,
  { check, now, streamed }: { check: AnswerCheck<T>; now: () => number; streamed: string },
): Promise<Result<T, Failure>> => {
  if (NoObjectGeneratedError.isInstance(error)) {
    return err({ kind: "invalid", message: messageOf(error) });
  }
  if (!isSchemaRefusal(error)) {
    return err({ kind: "failed", message: messageOf(error), retryAt: retryAtOf(error, now()) });
  }
  for (const text of refusedAnswers(error, streamed)) {
    const parsed = await check.check(parsedJson(text));
    if (parsed.success) {
      log.info("llm: answer read from the endpoint's own schema refusal");
      return ok(parsed.data);
    }
  }
  return err({ kind: "invalid", message: messageOf(error) });
};

type AskArgs<T> = {
  readonly provider: ParseProvider;
  readonly prompt: ParsePrompt;
  readonly check: AnswerCheck<T>;
  readonly signal: AbortSignal;
  readonly onFirstToken: () => void;
  readonly now: () => number;
};

/** One provider's streamed answer, through `check`; `onFirstToken` marks its TTFT. */
const askOne = async <T>(args: AskArgs<T>): Promise<Result<T, Failure>> => {
  const { check, now, onFirstToken, prompt, provider, signal } = args;
  // What the endpoint streamed, kept for the case it refuses that answer itself at the end.
  let streamed = "";
  try {
    const answer = streamText({
      abortSignal: signal,
      maxRetries: 0,
      model: provider.model,
      // Errors arrive as stream parts below; this only keeps the SDK from printing them.
      onError: () => undefined,
      output: Output.object({ schema: check.shown }),
      prompt: prompt.prompt,
      system: prompt.system,
      ...(provider.providerOptions !== undefined && { providerOptions: provider.providerOptions }),
    });
    for await (const part of answer.stream) {
      if (part.type === "error") {
        return await failedAnswer(part.error, { check, now, streamed });
      }
      if (part.type === "text-delta") {
        streamed += part.text;
      }
      if (FIRST_TOKEN_PARTS.has(part.type)) {
        onFirstToken();
      }
    }
    const parsed = await check.check(await answer.output);
    return parsed.success
      ? ok(parsed.data)
      : err({ kind: "invalid", message: parsed.error.message });
  } catch (error) {
    return await failedAnswer(error, { check, now, streamed });
  }
};

/** What a read ran into: the providers it may ask, the limits met, the soonest one back. */
class ReadOutcome {
  readonly ready: readonly ParseProvider[];
  readonly limited: Record<string, string> = {};
  retryAt: null | string = null;
  /** Every failure so far was an answer out of shape (and no provider was resting). */
  isEveryAnswerInvalid: boolean;

  /** The providers not resting at `now`; the resting ones only say when they are back. */
  constructor(providers: readonly ParseProvider[], cooldowns: Cooldowns, now: string) {
    const isResting = (provider: ParseProvider): boolean => (cooldowns[provider.name] ?? "") > now;
    this.ready = providers.filter((provider) => !isResting(provider));
    for (const provider of providers) {
      if (isResting(provider)) {
        this.retryAt = earliest(this.retryAt, cooldowns[provider.name] ?? null);
      }
    }
    // A provider resting now may read it later: then no text is hopeless.
    this.isEveryAnswerInvalid = this.ready.length === providers.length && this.ready.length > 0;
  }

  /** A failed provider: logged, and a rate limit remembered with when it is back. */
  noteFailure(index: number, failure: Failure): void {
    const name = this.ready[index]?.name ?? "?";
    log.warn("llm: provider failed", { kind: failure.kind, provider: name, why: failure.message });
    if (failure.kind !== "failed") {
      return;
    }
    this.isEveryAnswerInvalid = false;
    if (failure.retryAt === null) {
      return;
    }

    this.limited[name] = failure.retryAt;
    this.retryAt = earliest(this.retryAt, failure.retryAt);
  }

  /** The race's result as the read's answer. */
  answerOf<T>(won: Result<Won<T>, Lost>): Result<Answer<T>, LlmError> {
    const { limited, retryAt } = this;
    if (won.ok) {
      const provider = this.ready[won.value.index]?.name ?? "?";
      return ok({ limited, provider, result: won.value.value });
    }
    const isHopeless = this.isEveryAnswerInvalid && won.error === "failed";
    return err({ code: isHopeless ? "llm/invalid-output" : "llm/unavailable", limited, retryAt });
  }
}

/**
Asks the providers for an answer of `schema`'s shape, in priority order but hedged: the next
provider is asked as well when the current one fails, or has not started answering (first
token) within `hedgeAfterMs`; the first valid answer wins and the others are cancelled.
A provider known to be rate limited (`cooldowns`) is skipped until its time. When every one
fails, the error says when the soonest will be back. Both outcomes report the limits this call
ran into, for the caller to remember.
*/
export const runStructured = async <T>(
  providers: readonly ParseProvider[],
  prompt: ParsePrompt,
  options: RunOptions & { readonly schema: z.ZodType<T> },
): Promise<Result<Answer<T>, LlmError>> => {
  const { cooldowns = {}, now = Date.now, schema } = options;
  const outcome = new ReadOutcome(providers, cooldowns, new Date(now()).toISOString());
  const check = answerCheck(schema);
  const won = await hedgedRace(
    outcome.ready.map(
      (provider) =>
        async ({ onFirstToken, signal }: { onFirstToken: () => void; signal: AbortSignal }) =>
          await askOne({ check, now, onFirstToken, prompt, provider, signal }),
    ),
    {
      giveUpAfterMs: GIVE_UP_AFTER_MS,
      hedgeAfterMs: HEDGE_AFTER_MS,
      ...options,
      onFailure: (index, failure: Failure) => {
        outcome.noteFailure(index, failure);
      },
    },
  );
  return outcome.answerOf(won);
};

/** The parse: free text read into actions on tasks and activities. */
export const runParse = async (
  providers: readonly ParseProvider[],
  prompt: ParsePrompt,
  options: RunOptions = {},
): Promise<Result<ParseAnswer, LlmError>> =>
  await runStructured(providers, prompt, { ...options, schema: ModelOutputSchema });
