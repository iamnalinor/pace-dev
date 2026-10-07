import { describe, expect, it } from "vitest";

import { cn } from "./cn.ts";

describe("cn", () => {
  it("merges conditional classes and resolves Tailwind conflicts", () => {
    expect(cn("p-2", { hidden: false, "text-fg": true }, "p-4")).toBe("text-fg p-4");
  });
});
