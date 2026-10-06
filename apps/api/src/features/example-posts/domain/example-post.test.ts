import { describe, expect, test } from "bun:test";

import { EXAMPLE_POST_MAX_LENGTH, parseExamplePostBody } from "./example-post.ts";

// Widened to `unknown`: expectations compare with plain strings, not the branded type.
const parse = (raw: string): unknown => parseExamplePostBody(raw);

describe("parseExamplePostBody", () => {
  test("trims surrounding whitespace", () => {
    expect(parse("  hello \n")).toEqual({ ok: true, value: "hello" });
  });

  test.each(["", " ".repeat(3), "\n\t "])("rejects whitespace-only body %j", (raw) => {
    expect(parse(raw)).toEqual({ error: "example-post/empty", ok: false });
  });

  test("counts code points, not UTF-16 units: emoji at the limit is accepted", () => {
    const body = "😀".repeat(EXAMPLE_POST_MAX_LENGTH);

    expect(body).toHaveLength(EXAMPLE_POST_MAX_LENGTH * 2);
    expect(parse(body)).toEqual({ ok: true, value: body });
  });

  test("rejects one code point over the limit", () => {
    expect(parse("a".repeat(EXAMPLE_POST_MAX_LENGTH + 1))).toEqual({
      error: "example-post/too-long",
      ok: false,
    });
  });

  test("normalizes to NFC so combining sequences count as one character", () => {
    const decomposed = "é".repeat(EXAMPLE_POST_MAX_LENGTH);
    const result = parse(decomposed);

    expect(result).toEqual({ ok: true, value: "é".repeat(EXAMPLE_POST_MAX_LENGTH) });
  });
});
