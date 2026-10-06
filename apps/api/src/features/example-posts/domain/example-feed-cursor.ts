import { err, ok, type Result } from "../../../shared/result.ts";

/**
 * Position in the feed for keyset pagination: the last seen (createdAt, id) pair.
 * `id` breaks ties between posts created in the same millisecond.
 */
export type ExampleFeedCursor = { readonly createdAt: Date; readonly id: string };

export type ExampleFeedCursorError = "example-feed/invalid-cursor";

const UUID_GROUP_LENGTHS = [8, 4, 4, 4, 12];
const HEX = /^[\da-f]+$/;

const isUuid = (text: string): boolean => {
  const groups = text.split("-");
  return (
    groups.length === UUID_GROUP_LENGTHS.length &&
    groups.every((group, index) => group.length === UUID_GROUP_LENGTHS[index] && HEX.test(group))
  );
};

const toBase64Url = (text: string): string =>
  btoa(text)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/={1,2}$/, "");

const fromBase64Url = (text: string): string =>
  atob(text.replaceAll("-", "+").replaceAll("_", "/"));

/** Opaque to clients: they pass it back verbatim, never build or parse it. */
export const encodeExampleFeedCursor = (cursor: ExampleFeedCursor): string =>
  toBase64Url(JSON.stringify([cursor.createdAt.getTime(), cursor.id]));

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(fromBase64Url(text));
  } catch {
    return undefined;
  }
};

const isCursorTuple = (value: unknown): value is readonly [number, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  Number.isSafeInteger(value[0]) &&
  typeof value[1] === "string" &&
  isUuid(value[1]);

/** Never throws: any malformed or tampered input becomes a typed error. */
export const decodeExampleFeedCursor = (
  text: string,
): Result<ExampleFeedCursor, ExampleFeedCursorError> => {
  const value = parseJson(text);
  if (!isCursorTuple(value)) {
    return err("example-feed/invalid-cursor");
  }
  const [time, id] = value;
  const createdAt = new Date(time);
  return Number.isNaN(createdAt.getTime())
    ? err("example-feed/invalid-cursor")
    : ok({ createdAt, id });
};
