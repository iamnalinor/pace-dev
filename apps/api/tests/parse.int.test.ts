import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { ParseResponse } from "@pace/core";

import { createApp } from "../src/app.ts";
import { fakeParseModel } from "../src/parse/fake-model.ts";
import { json, loginAsDev } from "./helpers.ts";

const parse = async (token: string, text: string): Promise<ParseResponse> =>
  await json<ParseResponse>("/api/parse", { body: { text }, token });

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
    const answer = (await response.json()) as ParseResponse;
    expect(answer.status).toBe("unavailable");
    expect(answer.status === "unavailable" ? answer.retryAt : null).toMatch(/T/u);
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
