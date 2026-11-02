import { describe, expect, it } from "vitest";

import { echoParse, fakeParseModel, type FakeReply } from "./fake-model.ts";
import { memoryHealth } from "./health-store.ts";
import { type ParseProvider, runParse } from "./llm.ts";

/** Reads through the providers' health memory, shared by every user (each with no rests of their own). */

const NOW = Date.parse("2026-11-02T10:00:00.000Z");
const PROMPT = { prompt: "купить кабель", system: "Domain: task" };

/** A provider that notes in `asked` each time it is asked, then replies. */
const noting = (
  asked: string[],
  name: string,
  reply: (text: string) => FakeReply,
): ParseProvider => ({
  model: fakeParseModel((text) => {
    asked.push(name);
    return reply(text);
  }),
  name,
});

const down = (): FakeReply => ({ unavailableWith: 503 });

describe("runParse with the health memory", () => {
  it("asks a provider that just failed last, for the next person too", async () => {
    const health = memoryHealth();
    const asked: string[] = [];
    const pool = [noting(asked, "down", down), noting(asked, "good", echoParse)];
    expect(await runParse(pool, PROMPT, { health, now: () => NOW })).toMatchObject({
      ok: true,
      value: { provider: "good" },
    });
    expect(asked).toEqual(["down", "good"]);
    asked.length = 0;
    const next = await runParse(pool, PROMPT, { health, hedgeAfterMs: 60_000, now: () => NOW });
    expect(next).toMatchObject({ ok: true, value: { provider: "good" } });
    expect(asked).toEqual(["good"]);
  });

  it("probes it in its place once the penalty is over, never making anyone wait on it", async () => {
    const health = memoryHealth({
      down: { reason: "503", strikes: 1, until: new Date(NOW - 1000).toISOString() },
    });
    const pool = [
      { model: fakeParseModel(down, { firstTokenAfterMs: 1500 }), name: "down" },
      { model: fakeParseModel(echoParse), name: "good" },
    ];
    const started = Date.now();
    const read = await runParse(pool, PROMPT, { health, hedgeAfterMs: 60_000, now: () => NOW });
    expect(read).toMatchObject({ ok: true, value: { provider: "good" } });
    expect(Date.now() - started).toBeLessThan(700);
  });

  it("clears the record on a success: back in its place, asked alone", async () => {
    const health = memoryHealth({
      back: { reason: "503", strikes: 3, until: new Date(NOW - 1000).toISOString() },
    });
    const asked: string[] = [];
    const pool = [noting(asked, "back", echoParse), noting(asked, "other", echoParse)];
    expect(await runParse(pool, PROMPT, { health, now: () => NOW })).toMatchObject({
      ok: true,
      value: { provider: "back" },
    });
    expect(await health.read()).toEqual({});
    asked.length = 0;
    await runParse(pool, PROMPT, { health, hedgeAfterMs: 60_000, now: () => NOW });
    expect(asked).toEqual(["back"]);
  });

  it("asks in the configured order when every provider is under penalty", async () => {
    const until = new Date(NOW + 60_000).toISOString();
    const health = memoryHealth({
      first: { reason: "503", strikes: 1, until },
      second: { reason: "503", strikes: 2, until },
    });
    const asked: string[] = [];
    const read = await runParse(
      [noting(asked, "first", down), noting(asked, "second", echoParse)],
      PROMPT,
      { health, now: () => NOW },
    );
    expect(read).toMatchObject({ ok: true, value: { provider: "second" } });
    expect(asked).toEqual(["first", "second"]);
  });

  it("doubles the penalty of a probe that fails again", async () => {
    const health = memoryHealth({
      down: { reason: "503", strikes: 1, until: new Date(NOW - 1000).toISOString() },
    });
    await runParse([{ model: fakeParseModel(down), name: "down" }], PROMPT, {
      health,
      now: () => NOW,
    });
    expect(await health.read()).toMatchObject({
      down: { strikes: 2, until: new Date(NOW + 2 * 60_000).toISOString() },
    });
  });

  it("holds against a provider neither a rate limit, a refused key nor an answer out of shape", async () => {
    const health = memoryHealth();
    await runParse(
      [
        { model: fakeParseModel(() => ({ rateLimitedFor: 30 })), name: "limited" },
        { model: fakeParseModel(() => ({ refusedWith: 401 })), name: "refused" },
        {
          model: fakeParseModel(() => ({ schemaRefused: { domain: "nope" }, via: "stream" })),
          name: "strict",
        },
        { model: fakeParseModel(() => ({ domain: "nope" }) as never), name: "garbled" },
        { model: fakeParseModel(echoParse), name: "good" },
      ],
      PROMPT,
      { health, now: () => NOW },
    );
    expect(await health.read()).toEqual({});
  });

  it("counts a server error, a dropped connection and a hung stream against it", async () => {
    const health = memoryHealth();
    await runParse(
      [
        { model: fakeParseModel(() => ({ unavailableWith: 500 })), name: "broken" },
        { model: fakeParseModel(echoParse, { breaksMidStream: true }), name: "dropped" },
      ],
      PROMPT,
      { health, now: () => NOW },
    );
    await runParse(
      [{ model: fakeParseModel(echoParse, { firstTokenAfterMs: 60_000 }), name: "hung" }],
      PROMPT,
      { giveUpAfterMs: 50, health, now: () => NOW },
    );
    expect(Object.keys(await health.read()).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "broken",
      "dropped",
      "hung",
    ]);
  });

  it("moves a provider last once it was silent past the hedge twice while another answered", async () => {
    const health = memoryHealth();
    const pool = [
      { model: fakeParseModel(echoParse, { firstTokenAfterMs: 2000 }), name: "sleepy" },
      { model: fakeParseModel(echoParse), name: "quick" },
    ];
    const options = { health, hedgeAfterMs: 30, now: () => NOW };
    await runParse(pool, PROMPT, options);
    expect(await health.read()).toEqual({ sleepy: { reason: "slow", strikes: 1, until: null } });
    await runParse(pool, PROMPT, options);
    expect(await health.read()).toMatchObject({
      sleepy: { strikes: 2, until: new Date(NOW + 60_000).toISOString() },
    });
  });
});
