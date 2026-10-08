import { describe, expect, it } from "vitest";

import { artboardState, ctx } from "@pace/core/testing";

import { echoParse, fakeParseModel } from "./fake-model.ts";
import { availability, runParse } from "./llm.ts";
import { approxTokens, buildParsePrompt, PROMPT_TOKEN_BUDGET } from "./prompt.ts";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const prompt = buildParsePrompt("купить кабель", {
  ctx: ctx(),
  language: "en",
  state: artboardState(),
});

describe("buildParsePrompt", () => {
  it("lists categories, projects and open tasks within the token budget", () => {
    expect(prompt.system).toContain("hw.algebra: Algebra HW");
    expect(prompt.system).toContain("- Algebra");
    expect(prompt.system).toContain("Europe/Moscow");
    expect(prompt.prompt).toBe("купить кабель");
    expect(approxTokens(prompt.system + prompt.prompt)).toBeLessThan(PROMPT_TOKEN_BUDGET);
  });
});

describe("runParse", () => {
  it("returns the first provider's structured answer", async () => {
    const result = await runParse([{ model: fakeParseModel(echoParse), name: "groq" }], prompt);
    expect(result).toEqual({
      ok: true,
      value: { limited: {}, provider: "groq", result: echoParse("купить кабель") },
    });
  });

  it("moves to the next provider when one is rate limited", async () => {
    const result = await runParse(
      [
        { model: fakeParseModel(() => ({ rateLimitedFor: 20 })), name: "groq" },
        { model: fakeParseModel(echoParse), name: "gemini" },
      ],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "gemini" } });
    expect(Object.keys(result.ok ? result.value.limited : {})).toEqual(["groq"]);
  });

  it("says when the soonest provider is back once all are out", async () => {
    const result = await runParse(
      [
        { model: fakeParseModel(() => ({ rateLimitedFor: 120 })), name: "groq" },
        { model: fakeParseModel(() => ({ rateLimitedFor: 30 })), name: "gemini" },
      ],
      prompt,
      { now: () => NOW },
    );
    expect(result).toEqual({
      error: {
        code: "llm/unavailable",
        limited: { gemini: "2026-10-06T12:00:30.000Z", groq: "2026-10-06T12:02:00.000Z" },
        retryAt: "2026-10-06T12:00:30.000Z",
      },
      ok: false,
    });
  });

  it("skips a provider still cooling down without asking it", async () => {
    const asked: string[] = [];
    const model = (name: string) =>
      fakeParseModel((text) => {
        asked.push(name);
        return echoParse(text);
      });
    const result = await runParse(
      [
        { model: model("groq"), name: "groq" },
        { model: model("gemini"), name: "gemini" },
      ],
      prompt,
      { cooldowns: { groq: "2026-10-06T12:05:00.000Z" }, now: () => NOW },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "gemini" } });
    expect(asked).toEqual(["gemini"]);
  });
});

describe("availability", () => {
  it("is available while one provider is not cooling down, else says when", () => {
    const now = "2026-10-06T12:00:00.000Z";
    expect(availability(["groq", "gemini"], { groq: "2026-10-06T12:05:00.000Z" }, now)).toEqual({
      available: true,
      retryAt: null,
    });
    expect(
      availability(
        ["groq", "gemini"],
        { gemini: "2026-10-06T12:03:00.000Z", groq: "2026-10-06T12:05:00.000Z" },
        now,
      ),
    ).toEqual({ available: false, retryAt: "2026-10-06T12:03:00.000Z" });
  });
});
