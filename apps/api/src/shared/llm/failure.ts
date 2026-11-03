/**
What a provider's failed call says, sorted once for everything that acts on it: the race (try the
next one), the rate limits (rest it for this person), the health memory every user shares (ask it
last for a while) and the log. A failure is sorted by what it says, never by what it lacks (bug
class 97): an in-stream error object has no HTTP status and may still be a rate limit.
*/

import { StreamProviderError } from "ai";

import type { ParseUnavailableReason } from "@pace/core";

const DEFAULT_RETRY_MS = 60_000;
/** A refused key (401/403) stays refused until someone changes it: rest it this long. */
const REFUSED_KEY_MS = 60 * 60_000;

type Fields = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The fields of a failure: an `APICallError`, or the plain object a stream's error chunk carries. */
const fieldsOf = (error: unknown): Fields => (isRecord(error) ? error : {});

const headersOf = (error: unknown): Readonly<Record<string, unknown>> => {
  const headers = fieldsOf(error)["responseHeaders"];
  return isRecord(headers) ? headers : {};
};

/**
The HTTP status the call failed with; an in-stream error object's numeric `code` stands for one
(OpenRouter passes on `code: 502`, `code: 429`). `null` when it never got one: a dropped
connection, a timeout, an error object that says what it is in words.
*/
const statusOf = (error: unknown): null | number => {
  const fields = fieldsOf(error);
  const status = fields["statusCode"] ?? fields["code"];
  return typeof status === "number" ? status : null;
};

/** 4xx statuses about the provider, the key or the moment, not about this request. */
const NOT_ABOUT_THE_REQUEST: ReadonlySet<number> = new Set([401, 403, 404, 408, 409, 410, 429]);

/**
Whether the provider refused this request for good (a 400 or 422: a content filter, a context too
long, a malformed request): asking again with the same text gets the same answer. A 5xx, a dropped
connection, a timeout, a rate limit or a refused key is never one: those pass (review I2).
*/
export const isRequestRefusal = (error: unknown): boolean => {
  const status = statusOf(error);
  return status !== null && status >= 400 && status < 500 && !NOT_ABOUT_THE_REQUEST.has(status);
};

/** An in-stream error object's own words for what it is: its `code` and `type`, lower case. */
const wordsOf = (error: unknown): string => {
  const fields = fieldsOf(error);
  return [fields["code"], fields["type"]]
    .filter((word): word is string => typeof word === "string")
    .join(" ")
    .toLowerCase();
};

/** Words of an error object that say the provider failed or is overloaded, for everyone. */
const SERVER_WORDS = /server_error|internal_error|service_unavailable|overloaded/u;
/** The word of an error object that says this key or this person is rate limited. */
const RATE_LIMIT_WORD = "rate_limit";

/** The `error` object of the JSON body an endpoint refused with, if it sent one. */
const bodyErrorOf = (error: unknown): Fields => {
  const body = fieldsOf(error)["responseBody"];
  if (typeof body !== "string") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) && isRecord(parsed["error"]) ? parsed["error"] : {};
  } catch {
    return {};
  }
};

const textOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  const message = fieldsOf(error)["message"];
  return typeof message === "string" ? message : String(error);
};

const GENERATION_KEY = "failed_generation";

/** A JSON text without the generations it quotes (`failed_generation` holds the person's words). */
const withoutGenerations = (text: string): string => {
  try {
    return JSON.stringify(
      JSON.parse(text, (key, value: unknown) => (key === GENERATION_KEY ? undefined : value)),
    );
  } catch {
    return text;
  }
};

/** What is logged of the failure itself: an error's message, or an error object's own fields. */
const ownTextOf = (error: unknown): string => {
  if (StreamProviderError.isInstance(error)) {
    return `${wordsOf(error)} ${error.message}`.trim();
  }
  return error instanceof Error || !isRecord(error)
    ? textOf(error)
    : withoutGenerations(JSON.stringify(error)).slice(0, 300);
};

/**
Why a call failed, for the Worker's log: the status, the message and the start of the body, or
an in-stream error object's own fields; never a generation the endpoint quotes back, which holds
the person's words.
*/
export const messageOf = (error: unknown): string => {
  const status = fieldsOf(error)["statusCode"];
  const body = fieldsOf(error)["responseBody"];
  const start =
    typeof body === "string"
      ? ` ${withoutGenerations(body).replaceAll(/\s+/gu, " ").slice(0, 300)}`
      : "";
  return (typeof status === "number" ? `${String(status)} ` : "") + ownTextOf(error) + start;
};

const UNIT_MS: Readonly<Record<string, number>> = { m: 60_000, ms: 1, s: 1000 };

/** A length as rate limits write it ("2m5s", "8.93s", "120ms") in ms; `NaN` when it is none. */
const lengthMs = (token: string): number =>
  token
    .replace(/\.$/u, "")
    .split(/(?<=[a-z])(?=\d)/u)
    .map((part) => {
      const amount = /^[\d.]*/u.exec(part)?.[0] ?? "";
      return Number(amount) * (UNIT_MS[part.slice(amount.length)] ?? NaN);
    })
    .reduce((sum, ms) => sum + ms, 0);

/** The wait an error's own words name ("Please try again in 8.93s", "in 2m5s"), in ms. */
const namedWaitMs = (error: unknown): null | number => {
  const token = /try again in (\S+)/iu.exec(textOf(error))?.[1];
  const ms = token === undefined ? NaN : lengthMs(token);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null;
};

/** A rate limit: a 429, or an error object whose code or type says so. */
const isRateLimited = (error: unknown): boolean =>
  statusOf(error) === 429 || wordsOf(error).includes(RATE_LIMIT_WORD);

/**
A 429 (or a provider's "busy", or an in-stream rate limit): another provider may still answer,
and this one rests for this person until the time it names (its `retry-after`, or "try again in"
in its words), a minute without one. A refused key (401/403) rests longer, so a rotated-out key
is not asked first on every message (bug class 18).
*/
export const retryAtOf = (error: unknown, now: number): null | string => {
  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return new Date(now + REFUSED_KEY_MS).toISOString();
  }
  if (status !== 503 && !isRateLimited(error)) {
    return null;
  }
  const seconds = Number(headersOf(error)["retry-after"] ?? NaN);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : (namedWaitMs(error) ?? DEFAULT_RETRY_MS);
  return new Date(now + delay).toISOString();
};

const SCHEMA_REFUSAL_CODE = "json_validate_failed";

/**
The endpoint checked its own model's answer against our schema and refused it (bug class 85): a
best-effort structured-output endpoint whose model left keys out. Our request was fine and the
provider is up; the answer was out of shape.
*/
export const isSchemaRefusal = (error: unknown): boolean =>
  fieldsOf(error)["code"] === SCHEMA_REFUSAL_CODE ||
  bodyErrorOf(error)["code"] === SCHEMA_REFUSAL_CODE ||
  /does not match the expected schema/iu.test(textOf(error));

/**
The answers a schema refusal carries, best first: the generation its body names
(`failed_generation`), then what the endpoint streamed before it refused.
*/
export const refusedAnswers = (error: unknown, streamed: string): readonly string[] =>
  [
    bodyErrorOf(error)[GENERATION_KEY],
    fieldsOf(error)[GENERATION_KEY],
    // An in-stream refusal as the SDK hands it on keeps the endpoint's own object as `data`.
    fieldsOf(fieldsOf(error)["data"])[GENERATION_KEY],
    streamed,
  ].filter((text): text is string => typeof text === "string" && text.trim() !== "");

/**
Why a provider could not serve anyone, as a category: never free text, which may quote the
person (an endpoint's message can carry the generation).
*/
export type UnwellReason = "dropped" | "gone" | "server-error" | "timeout";

/**
A failure of the connection, not one the provider reported: any error but the error object a
stream carried, which the SDK hands on as a `StreamProviderError` (or bare, as older versions did).
*/
const isTransportFailure = (error: unknown): error is Error =>
  error instanceof Error && !StreamProviderError.isInstance(error);

const unwellOfStatus = (status: number): null | UnwellReason => {
  if (status >= 500) {
    return "server-error";
  }
  if (status === 408) {
    return "timeout";
  }
  return status === 404 || status === 410 ? "gone" : null;
};

/**
What a failed call (not an answer out of shape) says about the provider, for the health memory
every user shares: a 5xx, 404, 408 or 410; a transport failure (a dropped connection, the race
giving up, `gaveUp`); an in-stream error object whose code or type says server error or
overload. `null` when the failure is about this request, this key or this answer (a 400 or 422,
`invalid_request_error`, a content filter, a context too long, a schema refusal), a rate limit or
a refused key (they rest the provider for this person instead), or an error object that says
nothing we know (logged, held against nobody).
*/
export const unwellReasonOf = (error: unknown): null | UnwellReason => {
  if (isSchemaRefusal(error)) {
    return null;
  }
  const status = statusOf(error);
  if (status !== null) {
    return unwellOfStatus(status);
  }
  if (isTransportFailure(error)) {
    return error.name === "TimeoutError" || error.name === "AbortError" ? "timeout" : "dropped";
  }
  return SERVER_WORDS.test(wordsOf(error)) ? "server-error" : null;
};

/** Why a read no model answered failed: no model, every answer out of shape, a rest, or none of these. */
export const reasonOf = (read: {
  readonly hasProviders: boolean;
  readonly isHopeless: boolean;
  readonly retryAt: null | string;
}): ParseUnavailableReason => {
  if (!read.hasProviders) {
    return "off";
  }
  if (read.isHopeless) {
    return "unreadable";
  }
  return read.retryAt === null ? "unreachable" : "limited";
};
