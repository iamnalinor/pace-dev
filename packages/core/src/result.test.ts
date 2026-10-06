import { describe, expect, it } from "vitest";

import { err, ok } from "./result.ts";

describe("Result", () => {
  it("wraps a value", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("wraps an error", () => {
    expect(err("task/not-found")).toEqual({ error: "task/not-found", ok: false });
  });
});
