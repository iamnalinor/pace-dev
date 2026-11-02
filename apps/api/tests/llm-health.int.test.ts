import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { endpoints } from "@pace/core";

import { createApp } from "../src/app.ts";
import { echoParse, fakeParseModel } from "../src/shared/llm/fake-model.ts";
import { HEALTH_KEY } from "../src/shared/llm/health-store.ts";
import { loginAsDev, readJson } from "./helpers.ts";

/**
The providers' health memory through the real route, in workerd with the real KV: what one
person's read learns about a provider that is down, the next person's read uses.
*/

const noNetwork = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error("no network in tests");
};

/** The slot that is down answers 503 after 1.5 s, as a real one that is down does (1.6 s seen). */
const DOWN_AFTER_MS = 1500;

const slotsAsked: string[] = [];

const app = createApp({
  fetch: noNetwork,
  parseProviders: () => [
    {
      model: fakeParseModel(
        () => {
          slotsAsked.push("down");
          return { unavailableWith: 503 };
        },
        { firstTokenAfterMs: DOWN_AFTER_MS },
      ),
      name: "slot-down",
    },
    {
      model: fakeParseModel((text) => {
        slotsAsked.push("up");
        return echoParse(text);
      }),
      name: "slot-up",
    },
  ],
  telegramFetch: noNetwork,
});

/** The deployment's KV, counting what is written to it. */
const writes = { count: 0 };
const countedKv = {
  delete: async (key: string) => {
    writes.count += 1;
    await env.OAUTH_KV.delete(key);
  },
  get: async (key: string, type: "json") => await env.OAUTH_KV.get(key, type),
  put: async (key: string, value: string, options?: KVNamespacePutOptions) => {
    writes.count += 1;
    await env.OAUTH_KV.put(key, value, options);
  },
} as unknown as KVNamespace;

const parseAs = async (telegramId: string, text: string) => {
  const token = await loginAsDev(telegramId);
  const started = Date.now();
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request("https://pace-api.test/api/parse", {
      body: JSON.stringify({ text }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    }),
    { ...env, OAUTH_KV: countedKv },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  const answer = endpoints.parse.run.output.parse(await readJson(response));
  return { answer, ms: Date.now() - started };
};

describe("POST /api/parse with a provider that is down", () => {
  it("asks it last for the next person, who does not wait on it; KV is written once", async () => {
    const first = await parseAs("1001", "купить кабель");
    expect(first.answer).toMatchObject({ provider: "slot-up", status: "parsed" });
    expect(first.ms).toBeGreaterThanOrEqual(DOWN_AFTER_MS);
    expect(slotsAsked).toEqual(["down", "up"]);
    expect(await env.OAUTH_KV.get(HEALTH_KEY, "json")).toMatchObject({
      "slot-down": { reason: "503", strikes: 1 },
    });

    // Another person: no rate limit of theirs knows about the slot, the shared memory does.
    slotsAsked.length = 0;
    const second = await parseAs("1002", "позвонить маме");
    expect(second.answer).toMatchObject({ provider: "slot-up", status: "parsed" });
    expect(second.ms).toBeLessThan(DOWN_AFTER_MS / 2);
    expect(slotsAsked).toEqual(["up"]);

    // Nothing changed for either slot: nothing more is written.
    await parseAs("1002", "купить хлеб");
    expect(writes.count).toBe(1);
  });
});
