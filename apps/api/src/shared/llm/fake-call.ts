import { APICallError, type LanguageModel } from "ai";

/** Pieces of the scripted model (fake-model.ts): the errors a real provider throws, a cancellable wait. */

const apiError = (
  statusCode: number,
  message: string,
  {
    body,
    headers = {},
  }: { readonly body?: string; readonly headers?: Record<string, string> } = {},
): APICallError =>
  new APICallError({
    message,
    requestBodyValues: {},
    ...(body !== undefined && { responseBody: body }),
    responseHeaders: headers,
    statusCode,
    url: "https://fake.llm/v1",
  });

/**
What a best-effort structured-output endpoint says when its model's answer misses the schema
(copied from a real one, 2026-11-02): it checks the answer itself and refuses it.
*/
export const SCHEMA_REFUSAL = {
  code: "json_validate_failed",
  message:
    "Generated JSON does not match the expected schema. Please adjust your prompt. See 'failed_generation' for more details. Error: jsonschema: '/actions/0' does not validate with /properties/actions/items/required: missing properties: 'outcome', 'label', 'start', 'end', 'expectMinutes'",
  type: "invalid_request_error",
} as const;

/** The error a real provider throws for a refused key, a rate limit or an outage; nothing for an answer. */
export const failureOf = (answer: object): APICallError | null => {
  if ("refusedWith" in answer) {
    return apiError(Number(answer.refusedWith), "Invalid API key");
  }
  if ("badRequestWith" in answer) {
    // A refusal of this request for good (a content filter, a context too long): no retry hint.
    return apiError(Number(answer.badRequestWith), "Bad Request", {
      body: JSON.stringify({ code: "content_filter", message: "the request was refused" }),
    });
  }
  if ("unavailableWith" in answer) {
    // As a provider that is down says it: no retry header, a JSON body.
    return apiError(Number(answer.unavailableWith), "Service Unavailable", {
      body: JSON.stringify({ code: "provider_unavailable", message: "provider is unavailable" }),
    });
  }
  if ("schemaRefused" in answer && "via" in answer && answer.via === "body") {
    return apiError(400, SCHEMA_REFUSAL.message, {
      body: JSON.stringify({
        error: { ...SCHEMA_REFUSAL, failed_generation: JSON.stringify(answer.schemaRefused) },
      }),
    });
  }
  return "rateLimitedFor" in answer
    ? apiError(429, "Rate limit reached", {
        headers: { "retry-after": String(Number(answer.rateLimitedFor)) },
      })
    : null;
};

export const FINISH = { raw: "stop", unified: "stop" } as const;

export const USAGE = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: undefined, total: 100 },
  outputTokens: { reasoning: undefined, text: undefined, total: 50 },
};

/** A model object of the current provider specification (`LanguageModel` also admits ids). */
export type ModelObject = Extract<LanguageModel, { readonly specificationVersion: "v4" }>;

type Stream = Awaited<ReturnType<ModelObject["doStream"]>>["stream"];
type StreamPart = Stream extends ReadableStream<infer Part> ? Part : never;

/** What the scripted model streams: its text, and the error chunk it ends with, if any. */
export type Streamed = { readonly text: string; readonly errorAfter?: object };

/**
The parts of the answer: as one text part; or its start and a dropped connection; or all of it
and then an error chunk (an endpoint that checks the whole answer at its end and refuses it, or
an error object sent in place of an answer).
*/
const partsOf = (
  { errorAfter, text }: Streamed,
  how: { readonly breaksMidStream: boolean },
): readonly StreamPart[] => {
  const opening: StreamPart = { type: "stream-start", warnings: [] };
  if (how.breaksMidStream) {
    return [
      opening,
      { id: "0", type: "text-start" },
      { delta: text.slice(0, 10), id: "0", type: "text-delta" },
      { error: new Error("connection reset"), type: "error" },
    ];
  }
  // The first character goes alone, so a pause after the first token can come between.
  const body: readonly StreamPart[] =
    text === ""
      ? []
      : [
          { id: "0", type: "text-start" },
          { delta: text.slice(0, 1), id: "0", type: "text-delta" },
          { delta: text.slice(1), id: "0", type: "text-delta" },
        ];
  const ending: readonly StreamPart[] =
    errorAfter === undefined
      ? [
          { id: "0", type: "text-end" },
          { finishReason: FINISH, type: "finish", usage: USAGE },
        ]
      : [{ error: { ...errorAfter }, type: "error" }];
  return [opening, ...body, ...ending];
};

type StreamHow = {
  readonly breaksMidStream: boolean;
  /** How long it pauses after its first token before the rest of the answer, in ms. */
  readonly restAfterMs: number;
  readonly signal: AbortSignal | undefined;
};

/** The parts as a stream: up to the first token at once, the rest after `restAfterMs`. */
export const streamOf = (streamed: Streamed, how: StreamHow): Stream => {
  const parts = partsOf(streamed, how);
  const firstToken = parts.findIndex((part) => part.type === "text-delta") + 1;
  const pause = how.restAfterMs > 0 && firstToken > 0 ? firstToken : parts.length;
  return new ReadableStream({
    start: async (controller) => {
      for (const part of parts.slice(0, pause)) {
        controller.enqueue(part);
      }
      if (pause < parts.length) {
        await sleep(how.restAfterMs, how.signal);
      }
      for (const part of parts.slice(pause)) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
};

/** Waits `ms`, or rejects at once when the call is cancelled (as a real request would). */
export const sleep = async (ms: number, signal?: AbortSignal): Promise<void> => {
  signal?.throwIfAborted();
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    });
  });
};
