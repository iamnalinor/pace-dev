import { describe, expect, it } from "vitest";

import { decisionLabelKey } from "./decisions.ts";

describe("decisionLabelKey", () => {
  it("knows the kinds and outcomes the server writes, and nothing else", () => {
    expect(decisionLabelKey("outcome", "suppressed")).toBe("decisions.outcome.suppressed");
    expect(decisionLabelKey("kind", "parse")).toBe("decisions.kind.parse");
    expect(decisionLabelKey("kind", "toString")).toBeNull();
    expect(decisionLabelKey("outcome", "rescheduled")).toBeNull();
  });
});
