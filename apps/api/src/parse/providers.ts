import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

import type { Config } from "../shared/config.ts";
import type { ParseProvider } from "./llm.ts";

import { echoParse, fakeParseModel } from "./fake-model.ts";

/** Groq first (fast, strict JSON schema), Gemini as the fallback; only those with a key. */
export const parseProviders = (
  config: Pick<Config, "geminiApiKey" | "groqApiKey" | "llmProvider">,
): readonly ParseProvider[] => {
  if (config.llmProvider === "fake") {
    return [{ model: fakeParseModel(echoParse), name: "fake" }];
  }
  return [
    ...(config.groqApiKey === undefined
      ? []
      : [
          {
            model: createGroq({ apiKey: config.groqApiKey })("openai/gpt-oss-120b"),
            name: "groq",
            providerOptions: { groq: { reasoningFormat: "hidden", structuredOutputs: true } },
          },
        ]),
    ...(config.geminiApiKey === undefined
      ? []
      : [
          {
            model: createGoogleGenerativeAI({ apiKey: config.geminiApiKey })("gemini-flash-latest"),
            name: "gemini",
          },
        ]),
  ];
};
