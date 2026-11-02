/**
What a provider's failed call says, sorted once for everything that acts on it: the race (try the
next one), the rate limits (rest it) and the log.
*/

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

/** The HTTP status the call failed with; `null` when it never got one (a dropped connection, a timeout). */
const statusOf = (error: unknown): null | number => {
  const status = fieldsOf(error)["statusCode"];
  return typeof status === "number" ? status : null;
};

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

/** Why a call failed, for the Worker's log: the status, the message and the start of the body. */
export const messageOf = (error: unknown): string => {
  const status = statusOf(error);
  const body = fieldsOf(error)["responseBody"];
  const start = typeof body === "string" ? ` ${body.replaceAll(/\s+/gu, " ").slice(0, 300)}` : "";
  return (status === null ? "" : `${String(status)} `) + textOf(error) + start;
};

/**
A 429 (or a provider's "busy"): another provider may still answer. A refused key (401/403)
rests longer, so a rotated-out key is not asked first on every message (bug class 18).
*/
export const retryAtOf = (error: unknown, now: number): null | string => {
  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return new Date(now + REFUSED_KEY_MS).toISOString();
  }
  if (status !== 429 && status !== 503) {
    return null;
  }
  const seconds = Number(headersOf(error)["retry-after"] ?? NaN);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : DEFAULT_RETRY_MS;
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
  [bodyErrorOf(error)["failed_generation"], fieldsOf(error)["failed_generation"], streamed].filter(
    (text): text is string => typeof text === "string" && text.trim() !== "",
  );
