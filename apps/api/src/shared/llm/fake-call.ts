import { APICallError } from "ai";

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
