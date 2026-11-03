import { describe, expect, it, vi } from "vitest";

import { actionContext, type Event, MAX_CONTEXT_TASKS, type RequestDomain } from "@pace/core";
import { artboardState, at, ctx } from "@pace/core/testing";

import { SCHEMA_REFUSAL } from "./fake-call.ts";
import { echoParse, fakeParseModel, type FakeReply } from "./fake-model.ts";
import { availability, runParse } from "./llm.ts";
import { approxTokens, buildParsePrompt, PROMPT_TOKEN_BUDGET } from "./prompt.ts";
import { parseProviders } from "./providers.ts";
import { hedgedRace } from "./race.ts";
import { clampToJsonSchema, lenientJsonSchema } from "./schema-fit.ts";

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

/** Whether a read where each provider gives one of `replies` is refused for good. */
const isRefusedBy = async (...replies: readonly FakeReply[]): Promise<boolean> => {
  const result = await runParse(
    replies.map((reply, index) => ({
      model: fakeParseModel(() => reply),
      name: `p${String(index)}`,
    })),
    prompt,
    { now: () => NOW },
  );
  return !result.ok && result.error.isRefused;
};

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
        isRefused: false,
        limited: { backup: "2026-10-06T12:00:30.000Z", compatible: "2026-10-06T12:02:00.000Z" },
        reason: "limited",
        retryAt: "2026-10-06T12:00:30.000Z",
      },
      ok: false,
    });
  });

  it("calls a read refused for good only when every provider refused this request (review I2)", async () => {
    expect(await isRefusedBy({ badRequestWith: 400 }, { badRequestWith: 422 })).toBe(true);
    // One provider down, out of requests or with its key refused: not for good.
    expect(await isRefusedBy({ badRequestWith: 400 }, { unavailableWith: 503 })).toBe(false);
    expect(await isRefusedBy({ badRequestWith: 400 }, { rateLimitedFor: 30 })).toBe(false);
    expect(await isRefusedBy({ refusedWith: 401 })).toBe(false);
    expect(await isRefusedBy({ unavailableWith: 500 })).toBe(false);
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

const slow = (ms: number) => fakeParseModel(echoParse, { firstTokenAfterMs: ms });
const garbage = () => fakeParseModel(() => ({ domain: "nope" }) as never);
const endpoint = (slot: number, models: string[], keys = ["k"]) => ({
  apiKeys: keys,
  baseUrl: `https://models${String(slot)}.example/v1`,
  models,
  slot,
});

describe("runParse hedging", () => {
  it("asks the next provider in parallel when the first is silent past the hedge delay", async () => {
    const started = Date.now();
    const result = await runParse(
      [
        { model: slow(2000), name: "first" },
        { model: slow(0), name: "second" },
      ],
      prompt,
      { hedgeAfterMs: 30 },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "second" } });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("asks the next provider when one breaks off after its first token", async () => {
    const result = await runParse(
      [
        { model: fakeParseModel(echoParse, { breaksMidStream: true }), name: "first" },
        { model: slow(0), name: "second" },
      ],
      prompt,
      { hedgeAfterMs: 60_000 },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "second" } });
  });

  it("keeps hedging down the list until one answers", async () => {
    const result = await runParse(
      [
        { model: slow(2000), name: "first" },
        { model: slow(2000), name: "second" },
        { model: slow(0), name: "third" },
      ],
      prompt,
      { hedgeAfterMs: 30 },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "third" } });
  });

  it("moves on at once when a provider fails, without waiting for the hedge delay", async () => {
    const started = Date.now();
    const result = await runParse(
      [
        { model: fakeParseModel(() => ({ refusedWith: 403 })), name: "first" },
        { model: slow(0), name: "second" },
      ],
      prompt,
      { hedgeAfterMs: 60_000, now: () => NOW },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "second" } });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("never asks the next provider when the first starts answering in time", async () => {
    const asked: string[] = [];
    const counting = (name: string, ms: number) =>
      fakeParseModel(
        (text) => {
          asked.push(name);
          return echoParse(text);
        },
        { firstTokenAfterMs: ms },
      );
    const result = await runParse(
      [
        { model: counting("first", 10), name: "first" },
        { model: counting("second", 0), name: "second" },
      ],
      prompt,
      { hedgeAfterMs: 500 },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "first" } });
    expect(asked).toEqual(["first"]);
  });

  it("returns whichever answers first, even the one asked earlier", async () => {
    const result = await runParse(
      [
        { model: slow(80), name: "first" },
        { model: slow(1500), name: "second" },
      ],
      prompt,
      { hedgeAfterMs: 20 },
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "first" } });
  });

  it("tries the next provider when one answers out of shape", async () => {
    const result = await runParse(
      [
        { model: garbage(), name: "first" },
        { model: slow(0), name: "second" },
      ],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "second" } });
  });

  it("says invalid output only when every provider answered out of shape", async () => {
    const result = await runParse(
      [
        { model: garbage(), name: "first" },
        { model: garbage(), name: "second" },
      ],
      prompt,
    );
    expect(result).toMatchObject({ error: { code: "llm/invalid-output" }, ok: false });
  });
});

describe("runParse limits", () => {
  it("gives up on a provider that never finishes, so a hung stream cannot hold the request", async () => {
    const result = await runParse(
      [{ model: fakeParseModel(echoParse, { firstTokenAfterMs: 60_000 }), name: "hung" }],
      prompt,
      { giveUpAfterMs: 50 },
    );
    expect(result).toMatchObject({ error: { code: "llm/unavailable" }, ok: false });
  });

  it("ends the whole read at its deadline, however many providers are still thinking", async () => {
    const started = Date.now();
    const result = await runParse(
      [
        { model: slow(5000), name: "first" },
        { model: slow(5000), name: "second" },
      ],
      prompt,
      { deadlineMs: 80, hedgeAfterMs: 20 },
    );
    expect(result).toMatchObject({ error: { code: "llm/unavailable" }, ok: false });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does not call a text hopeless while a resting provider could still read it", async () => {
    const result = await runParse(
      [
        { model: garbage(), name: "first" },
        { model: slow(0), name: "resting" },
      ],
      prompt,
      { cooldowns: { resting: "2026-10-06T12:05:00.000Z" }, now: () => NOW },
    );
    expect(result).toMatchObject({
      error: { code: "llm/unavailable", retryAt: "2026-10-06T12:05:00.000Z" },
      ok: false,
    });
  });

  it("keeps an answer whose lists run past their limits, cut to them", async () => {
    const chatty = fakeParseModel(() => ({
      ...echoParse("x"),
      questions: [
        { field: "dueDate", options: ["a", "b", "c", "d", "e", "f", "g", ""], question: "When?" },
      ],
    }));
    const result = await runParse([{ model: chatty, name: "chatty" }], prompt);
    expect(result).toMatchObject({
      ok: true,
      value: { result: { questions: [{ options: ["a", "b", "c", "d", "e", "f"] }] } },
    });
  });

  it("shows the model the schema without length limits, which some endpoints refuse", () => {
    expect(
      lenientJsonSchema({
        properties: {
          maxLength: { type: "string" },
          tags: { items: { maxLength: 80, minLength: 1, type: "string" }, maxItems: 6 },
        },
        type: "object",
      }),
    ).toEqual({
      properties: { maxLength: { type: "string" }, tags: { items: { type: "string" } } },
      type: "object",
    });
  });
});

/** The keys a task's action does not use, which a best-effort model left out (smoke run, 2026-11-02). */
const UNUSED_BY_A_TASK: ReadonlySet<string> = new Set([
  "end",
  "expectMinutes",
  "label",
  "outcome",
  "start",
]);

/** `echoParse`'s answer to "x" with those keys left out of every action. */
const withKeysLeftOut = (): unknown => {
  const output = echoParse("x");
  return {
    ...output,
    actions: output.actions.map((action) =>
      Object.fromEntries(Object.entries(action).filter(([key]) => !UNUSED_BY_A_TASK.has(key))),
    ),
  };
};

/** An endpoint that refuses its model's answer, which our check refuses too. */
const refusedGarbage = (via: "body" | "stream") =>
  fakeParseModel(() => ({ schemaRefused: { domain: "nope" }, via }));

/** Every object node of a JSON schema, nested ones included. */
const objectNodes = (node: unknown): readonly Record<string, unknown>[] => {
  if (Array.isArray(node)) {
    return node.flatMap((item: unknown) => objectNodes(item));
  }
  if (typeof node !== "object" || node === null) {
    return [];
  }
  const record = node as Record<string, unknown>;
  const own = record["type"] === "object" ? [record] : [];
  return [...own, ...Object.values(record).flatMap((value) => objectNodes(value))];
};

describe("best-effort structured output (bug class 85)", () => {
  it("keeps an answer that leaves out the keys that do not apply, read as null", async () => {
    const result = await runParse(
      [{ model: fakeParseModel(() => withKeysLeftOut() as never), name: "terse" }],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "terse" } });
    expect(result.ok && result.value.result.actions[0]).toMatchObject({
      end: null,
      expectMinutes: null,
      label: null,
      outcome: null,
      start: null,
      title: "x",
    });
  });

  it("refuses an answer with no actions list: that is no reading, not nothing to do", async () => {
    const { actions: _actions, ...noActions } = echoParse("x");
    const result = await runParse(
      [
        { model: fakeParseModel(() => noActions as never), name: "terse" },
        { model: fakeParseModel(echoParse), name: "next" },
      ],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "next" } });
  });

  it("reads a root questions list left out as nothing to ask (round 7 review 4)", async () => {
    const { questions: _questions, ...noQuestions } = echoParse("x");
    const result = await runParse(
      [
        { model: fakeParseModel(() => noQuestions as never), name: "terse" },
        { model: fakeParseModel(echoParse), name: "next" },
      ],
      prompt,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { provider: "terse", result: { questions: [] } },
    });
  });

  it("fills only an action's nullable keys, never a list it left out", async () => {
    const output = echoParse("x");
    const [action] = output.actions;
    const { subtasks: _subtasks, ...withoutList } = action ?? {};
    const result = await runParse(
      [
        {
          model: fakeParseModel(() => ({ ...output, actions: [withoutList] }) as never),
          name: "terse",
        },
        { model: fakeParseModel(echoParse), name: "next" },
      ],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "next" } });
  });

  it("reads the answer an endpoint refused on its own schema check, from the error's body", async () => {
    const result = await runParse(
      [
        {
          model: fakeParseModel(() => ({ schemaRefused: withKeysLeftOut(), via: "body" })),
          name: "strict",
        },
      ],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "strict" } });
  });

  it("reads the answer an endpoint streamed before refusing it on its own schema check", async () => {
    const result = await runParse(
      [
        {
          model: fakeParseModel(() => ({ schemaRefused: withKeysLeftOut(), via: "stream" })),
          name: "strict",
        },
      ],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "strict" } });
  });

  it("reads the answer an endpoint refused in a stream chunk that carries the generation", async () => {
    const result = await runParse(
      [
        {
          model: fakeParseModel(() => ({
            streamsError: {
              ...SCHEMA_REFUSAL,
              failed_generation: JSON.stringify(withKeysLeftOut()),
            },
          })),
          name: "strict",
        },
      ],
      prompt,
    );
    expect(result).toMatchObject({ ok: true, value: { provider: "strict" } });
  });

  it("counts a refused answer that fails our check too as out of shape, not as an outage", async () => {
    const result = await runParse(
      [
        { model: refusedGarbage("body"), name: "first" },
        { model: refusedGarbage("stream"), name: "second" },
      ],
      prompt,
    );
    expect(result).toMatchObject({
      error: { code: "llm/invalid-output", retryAt: null },
      ok: false,
    });
  });

  it("tells the model to keep every key, null or empty where it does not apply", () => {
    expect(prompt.system).toContain(
      "Every action has every key: null (or [] for a list) where it does not apply.",
    );
  });

  it("shows the model a schema strict mode takes: every property required, no others", async () => {
    const bodies: unknown[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "null"));
      await Promise.resolve();
      return new Response("{}", { status: 500 });
    });
    try {
      await runParse(
        parseProviders({ llmEndpoints: [endpoint(1, ["luna"])], llmProvider: "auto" }),
        prompt,
      );
    } finally {
      fetchSpy.mockRestore();
    }
    const sent = bodies[0] as { response_format: { json_schema: { schema: unknown } } };
    const nodes = objectNodes(sent.response_format.json_schema.schema);
    expect(nodes.length).toBeGreaterThan(4);
    for (const node of nodes) {
      const keys = Object.keys(node["properties"] as object);
      expect(node["required"]).toEqual(keys);
      expect(node["additionalProperties"]).toBe(false);
    }
  });
});

describe("clampToJsonSchema", () => {
  it("cuts strings and lists to their limits and drops items shorter than allowed", () => {
    const schema = {
      properties: {
        items: {
          items: {
            properties: { label: { minLength: 1, type: "string" } },
            type: "object",
          },
          maxItems: 2,
          type: "array",
        },
        note: { anyOf: [{ maxLength: 3, type: "string" }, { type: "null" }] },
      },
      type: "object",
    };
    expect(
      clampToJsonSchema(
        {
          extra: 1,
          items: [{ label: "" }, { label: "a" }, { label: "b" }, { label: "c" }],
          note: "long",
        },
        schema,
      ),
    ).toEqual({ extra: 1, items: [{ label: "a" }, { label: "b" }], note: "lon" });
    expect(clampToJsonSchema({ note: null }, schema)).toEqual({ note: null });
  });
});

describe("hedgedRace", () => {
  it("counts an attempt that throws as failed instead of hanging", async () => {
    const result = await hedgedRace(
      [
        async () => {
          await Promise.resolve();
          throw new Error("boom");
        },
        async () => {
          await Promise.resolve();
          return { ok: true as const, value: "second" };
        },
      ],
      { giveUpAfterMs: 1000, hedgeAfterMs: 1000, onFailure: () => undefined },
    );
    expect(result).toEqual({ ok: true, value: { index: 1, value: "second" } });
  });
});

describe("parseProviders", () => {
  it("lists every model of every endpoint in priority order, each key apart", () => {
    const providers = parseProviders({
      llmEndpoints: [
        endpoint(1, ["luna", "sol"]),
        endpoint(2, ["gemini-flash-latest"], ["g1", "g2"]),
        endpoint(3, ["luna"]),
      ],
      llmProvider: "auto",
    });
    expect(providers.map((provider) => provider.name)).toEqual([
      "luna",
      "sol",
      "gemini-flash-latest",
      "gemini-flash-latest#2",
      "luna#2",
    ]);
  });

  it("asks every endpoint for structured output, so the model sees the JSON schema", () => {
    const [provider] = parseProviders({
      llmEndpoints: [endpoint(1, ["luna"])],
      llmProvider: "auto",
    });
    expect(provider?.model).toMatchObject({ modelId: "luna", supportsStructuredOutputs: true });
  });

  it("has no network providers when no model is configured", () => {
    expect(parseProviders({ llmEndpoints: [], llmProvider: "auto" })).toEqual([]);
  });

  it("sends the endpoint a JSON schema to answer in (bug class 40)", async () => {
    const bodies: unknown[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "null"));
      await Promise.resolve();
      return new Response("{}", { status: 500 });
    });
    try {
      await runParse(
        parseProviders({ llmEndpoints: [endpoint(1, ["luna"])], llmProvider: "auto" }),
        prompt,
      );
    } finally {
      fetchSpy.mockRestore();
    }
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      model: "luna",
      response_format: { json_schema: { schema: { type: "object" } }, type: "json_schema" },
      stream: true,
    });
    expect(JSON.stringify(bodies[0])).not.toMatch(/"maxLength":\d/u);
  });

  it("rests a refused key for an hour instead of asking it first on every message", async () => {
    const result = await runParse(
      [
        { model: fakeParseModel(() => ({ refusedWith: 401 })), name: "compatible" },
        { model: fakeParseModel(echoParse), name: "compatible-2" },
      ],
      prompt,
      { now: () => NOW },
    );
    expect(result).toMatchObject({
      ok: true,
      value: { limited: { compatible: "2026-10-06T13:00:00.000Z" }, provider: "compatible-2" },
    });
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
