import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

import type { Config } from "../config.ts";
import type { ParseProvider } from "./llm.ts";

import { echoParse, fakeParseModel } from "./fake-model.ts";

/** `groq`, `groq-2`, …: one name per key, so each key's rate limit is remembered on its own. */
const keyName = (provider: string, index: number): string =>
  index === 0 ? provider : `${provider}-${String(index + 1)}`;

/**
Groq first (fast, strict JSON schema), Gemini as the fallback; one provider per key, so a key
that hits its rate limit rests while the next one answers.
*/
export const parseProviders = (
  config: Pick<Config, "geminiApiKeys" | "groqApiKeys" | "llmProvider">,
): readonly ParseProvider[] => {
  if (config.llmProvider === "fake") {
    return [{ model: fakeParseModel(echoParse), name: "fake" }];
  }
  return [
    ...config.groqApiKeys.map((apiKey, index) => ({
      model: createGroq({ apiKey })("openai/gpt-oss-120b"),
      name: keyName("groq", index),
      providerOptions: { groq: { reasoningFormat: "hidden", structuredOutputs: true } },
    })),
    ...config.geminiApiKeys.map((apiKey, index) => ({
      model: createGoogleGenerativeAI({ apiKey })("gemini-flash-latest"),
      name: keyName("gemini", index),
    })),
  ];
};
