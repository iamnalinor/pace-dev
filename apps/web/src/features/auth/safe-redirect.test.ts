import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safe-redirect.ts";

describe("safeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/posts?page=2#top", "/posts?page=2#top"],
  ])("keeps same-app path %s", (next, expected) => {
    expect(safeRedirectPath(next)).toBe(expected);
  });

  it.each([
    ["missing", null],
    ["absolute URL", "https://evil.test"],
    ["protocol-relative URL", "//evil.test"],
    [String.raw`backslash trick (browsers treat /\ as //)`, String.raw`/\evil.test`],
    ["javascript: URL", "javascript:alert(1)"],
    ["relative path", "posts"],
  ])("falls back to / for %s", (_case, next) => {
    expect(safeRedirectPath(next)).toBe("/");
  });
});
