import type { z } from "zod";

import {
  type generateText,
  type LanguageModel,
  NoObjectGeneratedError,
  Output,
  streamText,
} from "ai";

import {
  err,
  type ModelOutput,
  ModelOutputSchema,
  ok,
  type ParseUnavailableReason,
  type Result,
} from "@pace/core";

import type { HealthMemory } from "./health-store.ts";
import type { ParsePrompt } from "./prompt.ts";

import { createLogger } from "../logger.ts";
import { type AnswerCheck, answerCheck, parsedJson } from "./answer-check.ts";
import {
  isSchemaRefusal,
  messageOf,
  refusedAnswers,
  retryAtOf,
  type UnwellReason,
  unwellReasonOf,
} from "./failure.ts";
import { type Health, orderByHealth, type Verdict, verdictOf } from "./health.ts";
import { hedgedRace, type Lost, type Won } from "./race.ts";

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
  /** Why no model read it, as the parse answer says it (bug class 99). */
  readonly reason: ParseUnavailableReason;
};

/** Why a read no model answered failed: no model, every answer out of shape, a rest, or none of these. */
const reasonOf = (read: {
  readonly hasProviders: boolean;
  readonly isHopeless: boolean;
  readonly retryAt: null | string;
}): ParseUnavailableReason => {
  if (!read.hasProviders) {
    return "off";
  }
  if (read.isHopeless) {
    return "unreadable";
  }
  return read.retryAt === null ? "unreachable" : "limited";
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
  /** The providers' health every user shares: who to ask last, and where this call's outcomes go. */
  readonly health?: HealthMemory;
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

/** Stream parts that mean the model has started answering. */
const FIRST_TOKEN_PARTS: ReadonlySet<string> = new Set([
  "reasoning-delta",
  "text-delta",
  "tool-input-delta",
]);

type Failure =
  | {
      readonly kind: "failed";
      readonly retryAt: null | string;
      readonly message: string;
      /** Why the provider could not serve anyone (`unwellReasonOf`); `null` for this request only. */
      readonly unwell: null | UnwellReason;
    }
  | { readonly kind: "invalid"; readonly message: string };

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
    return err({
      kind: "failed",
      message: messageOf(error),
      retryAt: retryAtOf(error, now()),
      unwell: unwellReasonOf(error),
    });
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
      instructions: prompt.system,
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
  /** Each position asked: when (the isolate's clock) and whether it has started answering. */
  private readonly asked = new Map<number, { readonly at: number; hasSpoken: boolean }>();
  /** The positions that failed, with what each failure showed about the provider's health. */
  private readonly failed = new Map<number, null | UnwellReason>();
  /** The providers not resting, in the order to ask them (`orderByHealth`). */
  readonly ready: readonly ParseProvider[];
  /** Positions in `ready` of probes: providers back from a penalty, asked with the next at once. */
  readonly probes: ReadonlySet<number>;
  readonly limited: Record<string, string> = {};
  retryAt: null | string = null;
  /** Every failure so far was an answer out of shape (and no provider was resting). */
  isEveryAnswerInvalid: boolean;
  /** Some provider is configured (resting or not). */
  readonly hasProviders: boolean;

  /** The providers not resting at `now`; the resting ones only say when they are back. */
  constructor(
    providers: readonly ParseProvider[],
    world: { readonly cooldowns: Cooldowns; readonly health: Health; readonly now: string },
  ) {
    const { cooldowns, health, now } = world;
    const isResting = (provider: ParseProvider): boolean => (cooldowns[provider.name] ?? "") > now;
    const order = orderByHealth(
      providers.filter((provider) => !isResting(provider)),
      health,
      now,
    );
    this.ready = order.ordered;
    this.probes = new Set(
      this.ready.keys().filter((index) => order.probes.has(this.ready[index]?.name ?? "")),
    );
    for (const provider of providers) {
      if (isResting(provider)) {
        this.retryAt = earliest(this.retryAt, cooldowns[provider.name] ?? null);
      }
    }
    this.hasProviders = providers.length > 0;
    // A provider resting now may read it later: then no text is hopeless.
    this.isEveryAnswerInvalid = this.ready.length === providers.length && this.ready.length > 0;
  }

  /** The provider at `index` is asked now; the returned call marks its first token. */
  start(index: number): () => void {
    const attempt = { at: Date.now(), hasSpoken: false };
    this.asked.set(index, attempt);
    return () => {
      attempt.hasSpoken = true;
    };
  }

  /** A failed provider: logged, a rate limit remembered with when it is back, an outage noted. */
  noteFailure(index: number, failure: Failure): void {
    const name = this.ready[index]?.name ?? "?";
    log.warn("llm: provider failed", { kind: failure.kind, provider: name, why: failure.message });
    this.failed.set(index, failure.kind === "failed" ? failure.unwell : null);
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

  /** What the race showed about each provider asked (`verdictOf`). */
  verdicts(won: Result<Won<unknown>, Lost>, hedgeAfterMs: number): readonly Verdict[] {
    const ended = Date.now();
    return [...this.asked].flatMap(([index, attempt]) => {
      const verdict = verdictOf({
        ...(this.failed.has(index) && { failure: this.failed.get(index) ?? null }),
        hasSpoken: attempt.hasSpoken,
        isOutwaited: won.ok && ended - attempt.at >= hedgeAfterMs,
        isProbe: this.probes.has(index),
        isWinner: won.ok && won.value.index === index,
        provider: this.ready[index]?.name ?? "?",
      });
      return verdict === null ? [] : [verdict];
    });
  }

  /** The race's result as the read's answer. */
  answerOf<T>(won: Result<Won<T>, Lost>): Result<Answer<T>, LlmError> {
    const { limited, retryAt } = this;
    if (won.ok) {
      const provider = this.ready[won.value.index]?.name ?? "?";
      return ok({ limited, provider, result: won.value.value });
    }
    const isHopeless = this.isEveryAnswerInvalid && won.error === "failed";
    return err({
      code: isHopeless ? "llm/invalid-output" : "llm/unavailable",
      limited,
      reason: reasonOf({ hasProviders: this.hasProviders, isHopeless, retryAt }),
      retryAt,
    });
  }
}

/**
Asks the providers for an answer of `schema`'s shape, in priority order but hedged: the next
provider is asked as well when the current one fails, or has not started answering (first
token) within `hedgeAfterMs`; the first valid answer wins and the others are cancelled.
A provider known to be rate limited (`cooldowns`) is skipped until its time. One the shared
`health` memory has under penalty is asked last, and what this call showed about each provider
is told back to it. When every one fails, the error says when the soonest will be back. Both
outcomes report the limits this call ran into, for the caller to remember.
*/
export const runStructured = async <T>(
  providers: readonly ParseProvider[],
  prompt: ParsePrompt,
  options: RunOptions & { readonly schema: z.ZodType<T> },
): Promise<Result<Answer<T>, LlmError>> => {
  const { cooldowns = {}, health, hedgeAfterMs = HEDGE_AFTER_MS, now = Date.now, schema } = options;
  const at = new Date(now()).toISOString();
  const outcome = new ReadOutcome(providers, {
    cooldowns,
    health: health === undefined ? {} : await health.read(),
    now: at,
  });
  const check = answerCheck(schema);
  const won = await hedgedRace(
    outcome.ready.map(
      (provider, index) =>
        async ({ onFirstToken, signal }: { onFirstToken: () => void; signal: AbortSignal }) => {
          const spoke = outcome.start(index);
          const firstToken = (): void => {
            spoke();
            onFirstToken();
          };
          return await askOne({ check, now, onFirstToken: firstToken, prompt, provider, signal });
        },
    ),
    {
      giveUpAfterMs: GIVE_UP_AFTER_MS,
      ...options,
      hedgeAfterMs,
      onFailure: (index, failure: Failure) => {
        outcome.noteFailure(index, failure);
      },
      probes: outcome.probes,
    },
  );
  await health?.record(outcome.verdicts(won, hedgeAfterMs), at);
  return outcome.answerOf(won);
};

/** The parse: free text read into actions on tasks and activities. */
export const runParse = async (
  providers: readonly ParseProvider[],
  prompt: ParsePrompt,
  options: RunOptions = {},
): Promise<Result<ParseAnswer, LlmError>> =>
  await runStructured(providers, prompt, { ...options, schema: ModelOutputSchema });
