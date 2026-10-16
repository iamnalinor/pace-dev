import { describe, expect, it } from "vitest";

import { actionContext, type Event, MAX_CONTEXT_TASKS, type RequestDomain } from "@pace/core";
import { artboardState, at, ctx } from "@pace/core/testing";

import { echoParse, fakeParseModel } from "./fake-model.ts";
import { availability, runParse } from "./llm.ts";
import { approxTokens, buildParsePrompt, PROMPT_TOKEN_BUDGET } from "./prompt.ts";
import { parseProviders } from "./providers.ts";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");

const promptFor = (state = artboardState(), domain: RequestDomain = "task") =>
  buildParsePrompt("купить кабель", {
    context: actionContext(state, ctx()),
    ctx: ctx(),
    domain,
    language: "en",
    state,
  });

const prompt = promptFor();

/** The most a prompt lists: 40 open tasks and 40 activities, every title at its longest. */
const crowded = (): ReturnType<typeof artboardState> => {
  const long = "Подготовить отчёт по проекту с длинным названием и деталями внутри";
  const events: Event[] = [];
  for (let index = 0; index < MAX_CONTEXT_TASKS; index += 1) {
    const occurredAt = new Date(NOW - (index + 1) * 60_000).toISOString();
    events.push(
      at(2000 + index, occurredAt, {
        payload: {
          fields: {},
          presetId: "personal",
          subtasks: [],
          taskId: `t-many-${String(index)}`,
          title: long,
        },
        type: "task.created",
      }),
      at(3000 + index, new Date(NOW - (index + 1) * 20 * 60_000).toISOString(), {
        payload: {
          activityId: `a-many-${String(index)}`,
          category: "commute",
          label: long.slice(0, 80),
        },
        type: "activity.started",
      }),
    );
  }
  return artboardState(new Date(NOW).toISOString(), events);
};

describe("buildParsePrompt", () => {
  it("lists categories, projects and open tasks within the token budget", () => {
    expect(prompt.system).toContain("hw.algebra: Algebra HW");
    expect(prompt.system).toContain("- Algebra");
    expect(prompt.system).toContain("Europe/Moscow");
    expect(prompt.prompt).toBe("купить кабель");
    expect(approxTokens(prompt.system + prompt.prompt)).toBeLessThan(PROMPT_TOKEN_BUDGET);
  });

  it("names tasks and activities by aliases only, and stays within the budget at its fullest", () => {
    const full = promptFor(crowded(), "auto");
    expect(full.system).toMatch(/^- t40: Подготовить/mu);
    expect(full.system).toMatch(/^- a1: \d{4}-\d{2}-\d{2} \d{2}:\d{2}–\d{2}:\d{2} Подготовить/mu);
    expect(full.system).not.toContain("t-many-");
    expect(full.system).not.toContain("a-many-");
    expect(full.system).toContain("Domain: decide.");
    expect(approxTokens(full.system + full.prompt)).toBeLessThan(PROMPT_TOKEN_BUDGET);
  });

  it("describes a weekly course with its rhythm and its open weeks", () => {
    expect(prompt.system).toMatch(/hw\.algebra: Algebra HW \(weekly homework, due Wed 23:59/u);
    expect(prompt.system).toContain("Algebra HW 6, due 2026-10-07");
    expect(prompt.system).toMatch(/description:/u);
  });
});

describe("runParse", () => {
  it("returns the first provider's structured answer", async () => {
    const result = await runParse(
      [{ model: fakeParseModel(echoParse), name: "compatible" }],
      prompt,
    );
    expect(result).toEqual({
      ok: true,
      value: { limited: {}, provider: "compatible", result: echoParse("купить кабель") },
    });
  });

  it("moves to the next provider when one is rate limited", async () => {
    const result = await runParse(
      [
        { model: fakeParseModel(() => ({ rateLimitedFor: 20 })), name: "compatible" },
        { model: fakeParseModel(echoParse), name: "backup" },
      ],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "backup" } });
    expect(Object.keys(result.ok ? result.value.limited : {})).toEqual(["compatible"]);
  });

  it("says when the soonest provider is back once all are out", async () => {
    const result = await runParse(
      [
        { model: fakeParseModel(() => ({ rateLimitedFor: 120 })), name: "compatible" },
        { model: fakeParseModel(() => ({ rateLimitedFor: 30 })), name: "backup" },
      ],
      prompt,
      { now: () => NOW },
    );
    expect(result).toEqual({
      error: {
        code: "llm/unavailable",
        limited: { backup: "2026-10-06T12:00:30.000Z", compatible: "2026-10-06T12:02:00.000Z" },
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
        { model: model("compatible"), name: "compatible" },
        { model: model("backup"), name: "backup" },
      ],
      prompt,
      { cooldowns: { compatible: "2026-10-06T12:05:00.000Z" }, now: () => NOW },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "backup" } });
    expect(asked).toEqual(["backup"]);
  });
});

describe("availability", () => {
  it("is available while one provider is not cooling down, else says when", () => {
    const now = "2026-10-06T12:00:00.000Z";
    expect(
      availability(["compatible", "backup"], { compatible: "2026-10-06T12:05:00.000Z" }, now),
    ).toEqual({
      available: true,
      retryAt: null,
    });
    expect(
      availability(
        ["compatible", "backup"],
        { backup: "2026-10-06T12:03:00.000Z", compatible: "2026-10-06T12:05:00.000Z" },
        now,
      ),
    ).toEqual({ available: false, retryAt: "2026-10-06T12:03:00.000Z" });
  });
});

describe("parseProviders", () => {
  it("makes one compatible provider per key, so a limited key rests while the next answers", () => {
    const providers = parseProviders({
      llmApiKeys: ["k1", "k2", "k3"],
      llmBaseUrl: "https://models.example/v1",
      llmModel: "reader-small",
      llmProvider: "auto",
    });
    expect(providers.map((provider) => provider.name)).toEqual([
      "compatible",
      "compatible-2",
      "compatible-3",
    ]);
  });

  it("has no network providers when no model is configured", () => {
    expect(
      parseProviders({ llmApiKeys: [], llmBaseUrl: "", llmModel: "", llmProvider: "auto" }),
    ).toEqual([]);
  });

  it("rotates to the second key of the same provider on a rate limit", async () => {
    const result = await runParse(
      [
        { model: fakeParseModel(() => ({ rateLimitedFor: 20 })), name: "compatible" },
        { model: fakeParseModel(echoParse), name: "compatible-2" },
      ],
      prompt,
      { now: () => NOW },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "compatible-2" } });
  });
});
