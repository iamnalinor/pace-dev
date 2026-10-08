import { describe, expect, it } from "vitest";

import { whyTitle } from "./why-lines.ts";

describe("whyTitle", () => {
  it("names the card after the task's place on Now", () => {
    expect(whyTitle(0, "en")).toBe("Why it's on top");
    expect(whyTitle(1, "en")).toBe("Why it's 2nd on Now");
    expect(whyTitle(-1, "en")).toBe("Why it's on Now");
  });
});
