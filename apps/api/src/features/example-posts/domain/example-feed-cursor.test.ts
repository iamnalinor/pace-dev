import { describe, expect, test } from "bun:test";
import { assert, date, property, record, string, uuid } from "fast-check";

import { decodeExampleFeedCursor, encodeExampleFeedCursor } from "./example-feed-cursor.ts";

const cursorArbitrary = record({
  createdAt: date({ noInvalidDate: true }),
  id: uuid(),
});

describe("example feed cursor", () => {
  test("decode(encode(cursor)) returns the same cursor", () => {
    assert(
      property(cursorArbitrary, (cursor) => {
        expect(decodeExampleFeedCursor(encodeExampleFeedCursor(cursor))).toEqual({
          ok: true,
          value: cursor,
        });
      }),
    );
  });

  test("encoded cursor is URL-safe", () => {
    assert(
      property(cursorArbitrary, (cursor) => {
        expect(encodeExampleFeedCursor(cursor)).toMatch(/^[\w-]+$/);
      }),
    );
  });

  test("arbitrary input never throws and is rejected unless it is a valid cursor", () => {
    assert(
      property(string(), (text) => {
        const result = decodeExampleFeedCursor(text);
        if (result.ok) {
          expect(encodeExampleFeedCursor(result.value)).toBe(text);
        }
      }),
    );
  });

  test.each([
    ["not base64", "%%%"],
    ["valid base64, not JSON", btoa("hello")],
    ["wrong shape", btoa(JSON.stringify({ id: "x" }))],
    ["id is not a uuid", btoa(JSON.stringify([0, "../../etc/passwd"]))],
    [
      "time out of Date range",
      btoa(JSON.stringify([9e15, "00000000-0000-4000-8000-000000000000"])),
    ],
  ])("rejects %s", (_name, text) => {
    expect(decodeExampleFeedCursor(text)).toEqual({
      error: "example-feed/invalid-cursor",
      ok: false,
    });
  });
});
