import { APICallError, type LanguageModel } from "ai";

import { type ActivityReading, type ParseResult, typedActivity } from "@pace/core";

import { ACTIVITY_PROMPT_MARK } from "./activity-prompt.ts";

/** What a scripted model does with a message: answer it, or be rate limited. */
export type FakeReply = ActivityReading | ParseResult | { readonly rateLimitedFor: number };

const USAGE = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: undefined, total: 100 },
  outputTokens: { reasoning: undefined, text: undefined, total: 50 },
};

type PromptMessage = { readonly role: string; readonly content: unknown };

/** The user's message as the model receives it. */
const messageOf = (prompt: readonly PromptMessage[]): string => {
  const user = prompt.findLast((message) => message.role === "user");
  const parts = Array.isArray(user?.content) ? (user.content as readonly { text?: string }[]) : [];
  return parts.map((part) => part.text ?? "").join("");
};

/** The system instructions, which say which question this is. */
const systemOf = (prompt: readonly PromptMessage[]): string => {
  const system = prompt.find((message) => message.role === "system");
  return typeof system?.content === "string" ? system.content : "";
};

/**
A model for tests and the e2e Worker (`LLM_PROVIDER=fake`): it never leaves the process.
`reply` decides per message; a rate limit throws the 429 a real provider would.
*/
/** A model object of the current provider specification (`LanguageModel` also admits ids). */
type ModelObject = Extract<LanguageModel, { readonly specificationVersion: "v4" }>;

export const fakeParseModel = (
  reply: (text: string, system: string) => FakeReply,
): LanguageModel => {
  const model: ModelObject = {
    doGenerate: async ({ prompt }) => {
      await Promise.resolve();
      const answer = reply(messageOf(prompt), systemOf(prompt));
      if ("rateLimitedFor" in answer) {
        throw new APICallError({
          message: "Rate limit reached",
          requestBodyValues: {},
          responseHeaders: { "retry-after": String(answer.rateLimitedFor) },
          statusCode: 429,
          url: "https://fake.llm/v1",
        });
      }
      return {
        content: [{ text: JSON.stringify(answer), type: "text" }],
        finishReason: { raw: "stop", unified: "stop" },
        usage: USAGE,
        warnings: [],
      };
    },
    doStream: async () => {
      await Promise.resolve();
      throw new Error("The fake parse model does not stream");
    },
    modelId: "fake-parse",
    provider: "fake",
    specificationVersion: "v4",
    supportedUrls: {},
  };
  return model;
};

/** An activity note read by the rules alone: its words, Other, the length it states. */
const echoActivity = (text: string): ActivityReading => ({
  category: "other",
  ...typedActivity(text),
});

/** The plainest reading of either question: a task titled with the message, or the note's words. */
export const echoReply = (text: string, system: string): ActivityReading | ParseResult =>
  system.startsWith(ACTIVITY_PROMPT_MARK) ? echoActivity(text) : echoParse(text);

/** The plainest reading: one new task titled with the message itself. */
export const echoParse = (text: string): ParseResult => ({
  category: null,
  description: null,
  dueDate: null,
  dueTime: null,
  estimateMinutes: null,
  evidence: [],
  importance: null,
  intent: "create_task",
  outcome: null,
  project: null,
  questions: [],
  subtasks: [],
  task: null,
  title: text.trim(),
});
