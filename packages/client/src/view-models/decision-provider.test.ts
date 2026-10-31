import { describe, expect, it } from "vitest";

import { providerLabel } from "./decision-provider.ts";

describe("providerLabel", () => {
  it("names a model by its identifier, without the slot suffix", () => {
    expect(providerLabel("gpt-5.6-luna")).toEqual({ kind: "model", name: "gpt-5.6-luna" });
    expect(providerLabel("openai/gpt-oss-120b#2")).toEqual({
      kind: "model",
      name: "openai/gpt-oss-120b",
    });
    expect(providerLabel(" gpt-5.6-luna #12 ")).toEqual({ kind: "model", name: "gpt-5.6-luna" });
  });

  it("never shows the internal names older rows hold", () => {
    for (const legacy of [
      "compatible",
      "compatible-2",
      "groq",
      "groq-2",
      "gemini",
      "gemini-2",
      "fake",
    ]) {
      expect(providerLabel(legacy)).toEqual({ kind: "assistant" });
    }
    expect(providerLabel("rules")).toEqual({ kind: "rules" });
  });

  it("says nothing when there is no name", () => {
    expect(providerLabel(null)).toBeNull();
    expect(providerLabel("")).toBeNull();
    expect(providerLabel("#2")).toBeNull();
  });
});
