import { APICallError } from "ai";

/** Pieces of the scripted model (fake-model.ts): the errors a real provider throws, a cancellable wait. */

const apiError = (
  statusCode: number,
  message: string,
  responseHeaders: Record<string, string> = {},
): APICallError =>
  new APICallError({
    message,
    requestBodyValues: {},
    responseHeaders,
    statusCode,
    url: "https://fake.llm/v1",
  });

/** The error a real provider throws for a refused key or a rate limit; nothing for an answer. */
export const failureOf = (answer: object): APICallError | null => {
  if ("refusedWith" in answer) {
    return apiError(Number(answer.refusedWith), "Invalid API key");
  }
  return "rateLimitedFor" in answer
    ? apiError(429, "Rate limit reached", { "retry-after": String(Number(answer.rateLimitedFor)) })
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
