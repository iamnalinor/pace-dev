import { describe, expect, it } from "vitest";

import type { HealthEntry } from "./health.ts";

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

/** A record whose penalty just ran out: the provider is probed in its place. */
const probation = (strikes: number): HealthEntry => ({
  reason: "server-error",
  strikes,
  until: new Date(NOW - 1000).toISOString(),
});

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
      down: { reason: "server-error", strikes: 1, until: new Date(NOW - 1000).toISOString() },
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

  it("takes a probe's first token as its recovery, though another answered first (bug class 96)", async () => {
    const health = memoryHealth({ back: probation(3) });
    const pool = [
      {
        model: fakeParseModel(echoParse, { firstTokenAfterMs: 20, restAfterMs: 400 }),
        name: "back",
      },
      { model: fakeParseModel(echoParse, { firstTokenAfterMs: 50 }), name: "quick" },
    ];
    const read = await runParse(pool, PROMPT, { health, now: () => NOW });
    expect(read).toMatchObject({ ok: true, value: { provider: "quick" } });
    expect(await health.read()).toEqual({});
  });

  it("puts a probe that could not be judged back in its place: the next read asks one provider", async () => {
    const health = memoryHealth({ slower: probation(2) });
    const asked: string[] = [];
    const pool = [
      {
        model: fakeParseModel(
          (text) => {
            asked.push("slower");
            return echoParse(text);
          },
          { firstTokenAfterMs: 150 },
        ),
        name: "slower",
      },
      noting(asked, "quick", echoParse),
    ];
    expect(await runParse(pool, PROMPT, { health, now: () => NOW })).toMatchObject({
      ok: true,
      value: { provider: "quick" },
    });
    asked.length = 0;
    const next = await runParse(pool, PROMPT, { health, now: () => NOW });
    expect(next).toMatchObject({ ok: true, value: { provider: "slower" } });
    expect(asked).toEqual(["slower"]);
    expect(await health.read()).toEqual({});
  });

  it("penalises a probe again when it stays silent past the hedge while another answers", async () => {
    const health = memoryHealth({ hung: probation(1) });
    const pool = [
      { model: fakeParseModel(echoParse, { firstTokenAfterMs: 60_000 }), name: "hung" },
      { model: fakeParseModel(echoParse, { firstTokenAfterMs: 80 }), name: "quick" },
    ];
    await runParse(pool, PROMPT, { health, hedgeAfterMs: 30, now: () => NOW });
    expect(await health.read()).toEqual({
      hung: { reason: "slow", strikes: 2, until: new Date(NOW + 60_000).toISOString() },
    });
  });

  it("strikes nobody slow when the read lost to its deadline", async () => {
    const health = memoryHealth();
    const pool = [
      { model: fakeParseModel(echoParse, { firstTokenAfterMs: 60_000 }), name: "first" },
      { model: fakeParseModel(echoParse, { firstTokenAfterMs: 60_000 }), name: "second" },
    ];
    const read = await runParse(pool, PROMPT, {
      deadlineMs: 80,
      health,
      hedgeAfterMs: 10,
      now: () => NOW,
    });
    expect(read).toMatchObject({ error: { code: "llm/unavailable" }, ok: false });
    expect(await health.read()).toEqual({});
  });

  it("clears the record on a success: back in its place, asked alone", async () => {
    const health = memoryHealth({
      back: { reason: "server-error", strikes: 3, until: new Date(NOW - 1000).toISOString() },
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
      first: { reason: "server-error", strikes: 1, until },
      second: { reason: "server-error", strikes: 2, until },
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
      down: { reason: "server-error", strikes: 1, until: new Date(NOW - 1000).toISOString() },
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
    const reasons = Object.entries(await health.read()).map(([name, entry]) => [
      name,
      entry.reason,
    ]);
    expect(Object.fromEntries(reasons)).toEqual({
      broken: "server-error",
      dropped: "dropped",
      hung: "timeout",
    });
  });

  it("reads an in-stream error by what it says: a rate limit rests it for this person, a server error counts", async () => {
    const health = memoryHealth();
    const read = await runParse(
      [
        {
          model: fakeParseModel(() => ({
            streamsError: {
              code: "rate_limit_exceeded",
              message: "Rate limit reached for model `m`. Please try again in 20s.",
              type: "tokens",
            },
          })),
          name: "limited",
        },
        {
          model: fakeParseModel(() => ({
            streamsError: { code: "server_error", message: "Provider disconnected unexpectedly" },
          })),
          name: "broken",
        },
        {
          model: fakeParseModel(() => ({
            streamsError: {
              code: "context_length_exceeded",
              message: "This model's maximum context length is 8192 tokens.",
              type: "invalid_request_error",
            },
          })),
          name: "short",
        },
        { model: fakeParseModel(echoParse), name: "good" },
      ],
      PROMPT,
      { health, now: () => NOW },
    );
    expect(read).toMatchObject({
      ok: true,
      value: { limited: { limited: new Date(NOW + 20_000).toISOString() }, provider: "good" },
    });
    expect(await health.read()).toEqual({
      broken: { reason: "server-error", strikes: 1, until: new Date(NOW + 60_000).toISOString() },
    });
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
