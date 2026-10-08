import { generateText, type LanguageModel, Output } from "ai";

import { err, ok, type ParseResult, ParseResultSchema, type Result } from "@pace/core";

import type { ParsePrompt } from "./prompt.ts";

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

export type ParseAnswer = {
  readonly result: ParseResult;
  readonly provider: string;
  readonly limited: Cooldowns;
};

const DEFAULT_RETRY_MS = 60_000;

type CallFailure = {
  readonly statusCode?: unknown;
  readonly responseHeaders?: Readonly<Record<string, string>> | undefined;
};

const failureOf = (error: unknown): CallFailure =>
  typeof error === "object" && error !== null ? error : {};

/** A 429 (or a provider's "busy"): another provider may still answer. */
const retryAtOf = (error: unknown, now: number): null | string => {
  const { responseHeaders, statusCode } = failureOf(error);
  const status = Number(statusCode);
  if (status !== 429 && status !== 503) {
    return null;
  }
  const seconds = Number(responseHeaders?.["retry-after"] ?? NaN);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : DEFAULT_RETRY_MS;
  return new Date(now + delay).toISOString();
};

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
Asks each provider in turn for the structured parse. A provider known to be rate limited
(`cooldowns`) is skipped until its time; a new rate limit moves on to the next one. When
every one is out, the answer says when the soonest will be back. Both outcomes report the
limits this call ran into, for the caller to remember.
*/
export const runParse = async (
  providers: readonly ParseProvider[],
  prompt: ParsePrompt,
  {
    cooldowns = {},
    now = Date.now,
  }: { readonly cooldowns?: Cooldowns; readonly now?: () => number } = {},
): Promise<Result<ParseAnswer, LlmError>> => {
  const limited: Record<string, string> = {};
  const attempt = async (
    index: number,
    retryAt: null | string,
  ): Promise<Result<ParseAnswer, LlmError>> => {
    const provider = providers[index];
    if (provider === undefined) {
      return err({ code: "llm/unavailable", limited, retryAt });
    }
    const cooling = cooldowns[provider.name];
    if (cooling !== undefined && cooling > new Date(now()).toISOString()) {
      return await attempt(index + 1, earliest(retryAt, cooling));
    }
    try {
      const output = Output.object({ schema: ParseResultSchema });
      const answer = await generateText({
        maxRetries: 0,
        model: provider.model,
        output,
        prompt: prompt.prompt,
        system: prompt.system,
        ...(provider.providerOptions !== undefined && {
          providerOptions: provider.providerOptions,
        }),
      });
      const parsed = ParseResultSchema.safeParse(answer.output);
      return parsed.success
        ? ok({ limited, provider: provider.name, result: parsed.data })
        : err({ code: "llm/invalid-output", limited, retryAt: null });
    } catch (error) {
      const next = retryAtOf(error, now());
      if (next !== null) {
        limited[provider.name] = next;
      }
      return await attempt(index + 1, earliest(retryAt, next));
    }
  };
  return await attempt(0, null);
};
