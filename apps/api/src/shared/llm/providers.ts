import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { Config } from "../config.ts";
import type { ParseProvider } from "./llm.ts";

import { echoReply, fakeParseModel } from "./fake-model.ts";

/** One name per key keeps rate limits independent while trying keys in order. */
const keyName = (index: number): string =>
  index === 0 ? "compatible" : `compatible-${String(index + 1)}`;

/** The configured OpenAI-compatible endpoint; an incomplete endpoint is rejected by loadConfig. */
export const parseProviders = (
  config: Pick<Config, "llmApiKeys" | "llmBaseUrl" | "llmModel" | "llmProvider">,
): readonly ParseProvider[] => {
  if (config.llmProvider === "fake") {
    return [{ model: fakeParseModel(echoReply), name: "fake" }];
  }
  if (config.llmBaseUrl === "" || config.llmModel === "") {
    return [];
  }
  return config.llmApiKeys.map((apiKey, index) => ({
    model: createOpenAICompatible({
      apiKey,
      baseURL: config.llmBaseUrl,
      name: keyName(index),
    })(config.llmModel),
    name: keyName(index),
  }));
};
