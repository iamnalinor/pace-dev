import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { Config } from "../config.ts";
import type { ParseProvider } from "./llm.ts";

import { echoReply, fakeParseModel } from "./fake-model.ts";

/** `luna`, then `luna#2` for the same model again (another key or endpoint): names stay apart. */
const uniqueName = (seen: Map<string, number>, model: string): string => {
  const count = (seen.get(model) ?? 0) + 1;
  seen.set(model, count);
  return count === 1 ? model : `${model}#${String(count)}`;
};

/**
Every model of every configured endpoint, in priority order: slot by slot, model by model, and
each key of a slot on its own (a key that hits its limit rests while the next one answers).
Structured outputs are on everywhere: without them an OpenAI-compatible endpoint is sent no
JSON schema and the answer rarely fits it (the cause of "Assistant unavailable", bug class 40).
*/
export const parseProviders = (
  config: Pick<Config, "llmEndpoints" | "llmProvider">,
): readonly ParseProvider[] => {
  if (config.llmProvider === "fake") {
    return [{ model: fakeParseModel(echoReply), name: "fake" }];
  }
  const seen = new Map<string, number>();
  return config.llmEndpoints.flatMap((endpoint) =>
    endpoint.models.flatMap((modelId) =>
      endpoint.apiKeys.map((apiKey) => {
        const name = uniqueName(seen, modelId);
        return {
          model: createOpenAICompatible({
            apiKey,
            baseURL: endpoint.baseUrl,
            name: `llm-${String(endpoint.slot)}`,
            supportsStructuredOutputs: true,
          })(modelId),
          name,
        };
      }),
    ),
  );
};
