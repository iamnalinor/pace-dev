import { generateText, type LanguageModel, Output } from "ai";

import { err, ok, type ParseResult, ParseResultSchema, type Result } from "@pace/core";

import type { ParsePrompt } from "./prompt.ts";

/** One model the parser may use, tried in order. */
export type ParseProvider = {
  readonly name: string;
  readonly model: LanguageModel;
  readonly providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];
};

export type LlmError = {
  readonly code: "llm/invalid-output" | "llm/unavailable";
  /** When a provider said it will take requests again (ISO), if any did. */
  readonly retryAt: null | string;
};

export type ParseAnswer = {
  readonly result: ParseResult;
  readonly provider: string;
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

/**
Asks each provider in turn for the structured parse. A rate limit moves on to the next
provider; when every one is out, the answer says when the soonest will be back.
*/
export const runParse = async (
  providers: readonly ParseProvider[],
  prompt: ParsePrompt,
  now: () => number = Date.now,
): Promise<Result<ParseAnswer, LlmError>> => {
  const attempt = async (
    index: number,
    retryAt: null | string,
  ): Promise<Result<ParseAnswer, LlmError>> => {
    const provider = providers[index];
    if (provider === undefined) {
      return err({ code: "llm/unavailable", retryAt });
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
        ? ok({ provider: provider.name, result: parsed.data })
        : err({ code: "llm/invalid-output", retryAt: null });
    } catch (error) {
      const next = retryAtOf(error, now());
      return await attempt(index + 1, earliest(retryAt, next));
    }
  };
  return await attempt(0, null);
};
