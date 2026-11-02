import { APICallError, streamText } from "ai";
import { describe, expect, it } from "vitest";

import { messageOf, retryAtOf, unwellReasonOf } from "./failure.ts";
import { fakeParseModel } from "./fake-model.ts";
import { gaveUp } from "./race.ts";

/**
How a failed call is sorted (bug class 97): by what it says, never by what it lacks. The
in-stream shapes are the `error` objects the OpenAI-compatible provider hands on from a chunk
(its schema keeps `message`, `type`, `param` and `code`), copied from each endpoint's own words.
*/

const NOW = Date.parse("2026-11-02T10:00:00.000Z");
const inSeconds = (seconds: number): string => new Date(NOW + seconds * 1000).toISOString();

/** OpenAI's (and every compatible server's) "the server had an error" chunk. */
const SERVER_ERROR = {
  code: null,
  message:
    "The server had an error while processing your request. Sorry about that! You can retry your request.",
  param: null,
  type: "server_error",
};
/** Groq when the model is overloaded mid-answer. */
const GROQ_OVERLOADED = {
  code: "service_unavailable",
  message: "Service Unavailable",
  type: "internal_server_error",
};
/** An endpoint that says it is overloaded in the Anthropic-style words some gateways pass on. */
const OVERLOADED = { message: "Overloaded", type: "overloaded_error" };
/** OpenRouter when the provider behind it drops mid-stream. */
const OPENROUTER_DISCONNECTED = {
  code: "server_error",
  message: "Provider disconnected unexpectedly",
};
/** OpenRouter's numeric codes, as its upstream passes on a 502. */
const OPENROUTER_502 = { code: 502, message: "Provider returned error" };
/** Groq's rate limit, with the time it names. */
const GROQ_RATE_LIMIT = {
  code: "rate_limit_exceeded",
  message:
    "Rate limit reached for model `m` in organization `org_1` service tier `on_demand` on tokens per minute (TPM): Limit 6000, Used 5740, Requested 1153. Please try again in 8.93s. Need more tokens?",
  type: "tokens",
};
/** Groq's rate limit with minutes in it. */
const GROQ_RATE_LIMIT_MINUTES = {
  ...GROQ_RATE_LIMIT,
  message: "Rate limit reached for model `m` on requests per day (RPD). Please try again in 2m5s.",
};
/** OpenRouter's rate limit: a numeric code, no time. */
const OPENROUTER_429 = { code: 429, message: "Rate limit exceeded: free-models-per-min." };
/** A rate limit said only by its type. */
const RATE_LIMIT_TYPE = { message: "Too many requests", type: "rate_limit_error" };
/** Our request: too long for the model. */
const CONTEXT_LENGTH = {
  code: "context_length_exceeded",
  message:
    "This model's maximum context length is 8192 tokens. However, your messages resulted in 9001 tokens.",
  param: "messages",
  type: "invalid_request_error",
};
/** Our request: the content filter refused it. */
const CONTENT_FILTER = {
  code: "content_filter",
  message: "The response was filtered due to the prompt triggering content management policy.",
  param: "prompt",
  type: null,
};
/** An object that says nothing we know: not taken for an outage. */
const UNKNOWN = { message: "something happened" };

/**
The error `askOne` receives for an in-stream error object: the SDK hands it on as a
`StreamProviderError` (its code, type and a status inferred from them), so every shape is
checked bare and as it really arrives.
*/
const throughSdk = async (shape: object): Promise<unknown> => {
  const answer = streamText({
    maxRetries: 0,
    model: fakeParseModel(() => ({ streamsError: shape })),
    onError: () => undefined,
    prompt: "x",
  });
  for await (const part of answer.stream) {
    if (part.type === "error") {
      return part.error;
    }
  }
  throw new Error("the stream carried no error");
};

/** `read` of each shape, bare and through the SDK. */
const readBoth = async <T>(
  shapes: readonly object[],
  read: (error: unknown) => T,
): Promise<readonly (readonly [T, T])[]> =>
  await Promise.all(
    shapes.map(async (shape) => [read(shape), read(await throughSdk(shape))] as const),
  );

const httpError = (statusCode: number): APICallError =>
  new APICallError({ message: "x", requestBodyValues: {}, statusCode, url: "https://x" });

const retryAt = (error: unknown): null | string => retryAtOf(error, NOW);

const twice = <T>(values: readonly T[]): readonly (readonly [T, T])[] =>
  values.map((value) => [value, value] as const);

describe("unwellReasonOf: what a failure says about the provider", () => {
  it("counts an in-stream server error or overload, as a category", async () => {
    const shapes = [
      SERVER_ERROR,
      GROQ_OVERLOADED,
      OVERLOADED,
      OPENROUTER_DISCONNECTED,
      OPENROUTER_502,
    ];
    expect(await readBoth(shapes, unwellReasonOf)).toEqual(twice(shapes.map(() => "server-error")));
  });

  it("counts transport failures: a dropped connection, a give-up", () => {
    expect(unwellReasonOf(new TypeError("fetch failed"))).toBe("dropped");
    expect(unwellReasonOf(new Error("connection reset"))).toBe("dropped");
    expect(unwellReasonOf(gaveUp(45_000))).toBe("timeout");
  });

  it("sorts HTTP statuses into categories", () => {
    expect([500, 503, 404, 410, 408].map((code) => unwellReasonOf(httpError(code)))).toEqual([
      "server-error",
      "server-error",
      "gone",
      "gone",
      "timeout",
    ]);
    expect(unwellReasonOf(httpError(400))).toBeNull();
  });

  it("holds a rate limit, our own request and an unknown object against nobody", async () => {
    const shapes = [
      GROQ_RATE_LIMIT,
      OPENROUTER_429,
      RATE_LIMIT_TYPE,
      CONTEXT_LENGTH,
      CONTENT_FILTER,
      UNKNOWN,
    ];
    expect(await readBoth(shapes, unwellReasonOf)).toEqual(twice(shapes.map(() => null)));
  });
});

describe("retryAtOf: an in-stream rate limit rests the provider for this person", () => {
  it("until the time it names", async () => {
    expect(await readBoth([GROQ_RATE_LIMIT, GROQ_RATE_LIMIT_MINUTES], retryAt)).toEqual(
      twice([inSeconds(8.93), inSeconds(125)]),
    );
  });

  it("for the default rest when it names none", async () => {
    expect(await readBoth([OPENROUTER_429, RATE_LIMIT_TYPE], retryAt)).toEqual(
      twice([inSeconds(60), inSeconds(60)]),
    );
  });

  it("not at all for our own request or a server error", async () => {
    expect(await readBoth([CONTEXT_LENGTH, CONTENT_FILTER, SERVER_ERROR], retryAt)).toEqual(
      twice([null, null, null]),
    );
  });
});

describe("messageOf: what is logged of a failure", () => {
  it("leaves out the generation an endpoint refused, which holds the person's words", () => {
    const refused = new APICallError({
      message: "Generated JSON does not match the expected schema.",
      requestBodyValues: {},
      responseBody: JSON.stringify({
        error: {
          code: "json_validate_failed",
          failed_generation: '{"actions":[{"title":"позвонить маме про анализы"}]}',
          message: "Generated JSON does not match the expected schema.",
        },
      }),
      statusCode: 400,
      url: "https://x",
    });
    const logged = messageOf(refused);
    expect(logged).toContain("json_validate_failed");
    expect(logged).not.toContain("позвонить");
    expect(logged).not.toContain("failed_generation");
  });

  it("leaves it out of an in-stream error object too, and says its code", async () => {
    const shape = {
      code: "json_validate_failed",
      failed_generation: '{"title":"позвонить маме"}',
      message: "Generated JSON does not match the expected schema.",
    };
    const [[bare, sdk] = ["", ""]] = await readBoth([shape], messageOf);
    expect(bare).not.toContain("позвонить");
    expect(sdk).not.toContain("позвонить");
    expect(sdk).toContain("json_validate_failed");
  });
});
