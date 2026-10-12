import {
  createExecutionContext,
  runDurableObjectAlarm,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { ParseResponse } from "@pace/core";

import { createApp } from "../src/app.ts";
import { fakeParseModel } from "../src/shared/llm/fake-model.ts";
import { json, loginAsDev, readJson } from "./helpers.ts";

const parse = async (token: string, text: string): Promise<ParseResponse> =>
  await json<ParseResponse>("/api/parse", { body: { text }, token });

describe("POST /api/parse/activity", () => {
  it("reads a note of what the person is doing into a label and a length", async () => {
    const token = await loginAsDev("1001");
    const answer = await json("/api/parse/activity", {
      body: { text: "Пошел в ЦСС, 20мин" },
      token,
    });
    expect(answer).toEqual({
      provider: "fake",
      reading: { category: "other", expectMinutes: 20, label: "Пошел в ЦСС" },
      status: "parsed",
    });
  });
});

describe("POST /api/parse", () => {
  it("reads a message into a checked parse and writes nothing", async () => {
    const token = await loginAsDev("1001");
    const answer = await parse(token, "купить кабель USB-C");
    expect(answer).toMatchObject({
      doubtful: [],
      isClean: true,
      provider: "fake",
      result: { intent: "create_task", title: "купить кабель USB-C" },
      status: "parsed",
    });
    const pulled = await json<{ events: unknown[] }>("/api/sync/pull", { token });
    expect(pulled.events).toEqual([]);
    const { decisions } = await json<{ decisions: { rule: string; outcome: string }[] }>(
      "/api/decisions?q=USB-C",
      { token },
    );
    expect(decisions[0]).toMatchObject({ outcome: "parsed", rule: "parse.create_task" });
  });

  it("says when no model can answer and when to try again", async () => {
    const token = await loginAsDev("1002");
    const app = createApp({
      fetch: async () => {
        throw new Error("no network in tests");
      },
      parseProviders: () => [
        { model: fakeParseModel(() => ({ rateLimitedFor: 30 })), name: "groq" },
      ],
      telegramFetch: async () => {
        throw new Error("no network in tests");
      },
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request("https://pace-api.test/api/parse", {
        body: JSON.stringify({ text: "что-нибудь" }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const answer = await readJson<ParseResponse>(response);
    expect(answer.status).toBe("unavailable");
    expect(answer.status === "unavailable" ? answer.retryAt : null).toMatch(/T/u);
  });

  it("keeps a deferred text and writes its reading once the assistant is back", async () => {
    const token = await loginAsDev("1002");
    const limited = createApp({
      fetch: async () => {
        throw new Error("no network in tests");
      },
      parseProviders: () => [
        { model: fakeParseModel(() => ({ rateLimitedFor: 30 })), name: "fake" },
      ],
      telegramFetch: async () => {
        throw new Error("no network in tests");
      },
    });
    const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
      const ctx = createExecutionContext();
      const response = await limited.fetch(
        new Request(`https://pace-api.test${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        }),
        env,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return response;
    };
    const queued = await readJson<ParseResponse>(
      await call("/api/parse", {
        body: JSON.stringify({ defer: true, text: "позвонить в банк" }),
        method: "POST",
      }),
    );
    expect(queued.status).toBe("queued");
    // The limit is remembered: the status says the assistant is out until then.
    const status = await readJson<{ available: boolean; retryAt: null | string }>(
      await call("/api/llm/status"),
    );
    expect(status.available).toBe(false);
    expect(status.retryAt).toMatch(/T/u);
    expect((await json<{ events: unknown[] }>("/api/sync/pull", { token })).events).toEqual([]);

    // The alarm comes when the limit lifts: the store reads the text itself (the fake model).
    const me = await json<{ id: string }>("/api/me", { token });
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(me.id));
    await stub.noteLlmLimits({ fake: "2000-01-01T00:00:00.000Z" }, new Date().toISOString());
    const later = Date.now() + 60_000;
    await stub.drainParses(new Date(later).toISOString());
    const pulled = await json<{ events: { type: string; payload: { title?: string } }[] }>(
      "/api/sync/pull",
      { token },
    );
    const created = pulled.events.find((event) => event.payload.title === "позвонить в банк");
    expect(created?.type).toBe("task.created");
    const { decisions } = await json<{ decisions: { rule: string; outcome: string }[] }>(
      "/api/decisions?q=позвонить",
      { token },
    );
    expect(decisions[0]).toMatchObject({ outcome: "applied", rule: "parse.deferred" });
    // The alarm armed when it was queued finds nothing left: no second copy.
    await runDurableObjectAlarm(stub);
    const again = await json<{ events: { type: string; payload: { title?: string } }[] }>(
      "/api/sync/pull",
      { token },
    );
    expect(again.events.filter((event) => event.payload.title === "позвонить в банк")).toHaveLength(
      1,
    );
  });

  it("refuses an empty message and a missing session", async () => {
    const token = await loginAsDev("1001");
    expect((await json<{ code: string }>("/api/parse", { body: { text: " " }, token })).code).toBe(
      "validation",
    );
    expect(
      (await json<{ code: string }>("/api/parse", { body: { text: "x" } })).code,
    ).toBeDefined();
  });
});
