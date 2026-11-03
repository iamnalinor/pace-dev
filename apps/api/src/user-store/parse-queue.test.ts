import { describe, expect, it } from "vitest";

import { addMinutesIso, INITIAL_CORE_STATE } from "@pace/core";

import { echoParse, fakeParseModel } from "../shared/llm/fake-model.ts";
import { memoryHealth } from "../shared/llm/health-store.ts";
import { PENALTY_BASE_MS } from "../shared/llm/health.ts";
import { BLIND_TRIES, drainOne, type QueuedParse } from "./parse-queue.ts";

/**
What a text read later becomes when no model reads it and no provider says when to come back
(round 7 review 2 and its minor): the drain counts those tries and waits for the providers' health.
*/

const NOW = "2099-10-07T19:00:00.000Z";

const queued: QueuedParse = {
  channel: "api",
  enqueuedAt: NOW,
  id: "q-1",
  retryAt: null,
  text: "купить хлеб",
};

/** Refused for this request, for good: no provider says when to come back. */
const refuses = () => ({ badRequestWith: 400 }) as const;

const drainWith = async (
  item: QueuedParse,
  reply: Parameters<typeof fakeParseModel>[0],
  now = NOW,
) => {
  const health = memoryHealth();
  const { drained } = await drainOne(item, {
    cooldowns: {},
    models: { health, providers: [{ model: fakeParseModel(reply), name: "only" }] },
    now,
    state: INITIAL_CORE_STATE,
  });
  return drained;
};

describe("drainOne without a retry time", () => {
  it("counts its tries and moves the text to the Inbox after a few, not after a day (review 2)", async () => {
    let item = queued;
    for (let tries = 1; tries < BLIND_TRIES; tries += 1) {
      const drained = await drainWith(item, refuses);
      expect(drained.kind).toBe("wait");
      if (drained.kind !== "wait") {
        return;
      }
      expect(drained.item.blindTries).toBe(tries);
      item = drained.item;
    }
    expect((await drainWith(item, refuses)).kind).toBe("inbox");
    expect(BLIND_TRIES).toBeLessThanOrEqual(5);
  });

  it("waits for the earliest health penalty to run out, not a fixed 5 minutes (review minor)", async () => {
    const drained = await drainWith(queued, () => ({ unavailableWith: 500 }) as const);
    // The provider is asked last for a minute: the drain comes back as it is a probe again.
    expect(drained).toMatchObject({
      item: { retryAt: addMinutesIso(NOW, PENALTY_BASE_MS / 60_000) },
      kind: "wait",
    });
  });

  it("never counts an outage: a text read later outlives a long one and is read when it ends (review I2)", async () => {
    let item = queued;
    let now = NOW;
    // Twenty failed drains over the hours of an outage (5xx with no time, a key refused): still queued.
    const outage = ([500, 502, 503, 504] as const).map(
      (status) => () => ({ unavailableWith: status }) as const,
    );
    const replies = [...outage, () => ({ refusedWith: 401 }) as const];
    for (let round = 0; round < 20; round += 1) {
      const reply = replies[round % replies.length] ?? refuses;
      const drained = await drainWith(item, reply, now);
      expect(drained.kind).toBe("wait");
      if (drained.kind !== "wait") {
        return;
      }
      expect(drained.item.blindTries ?? 0).toBe(0);
      item = drained.item;
      now = addMinutesIso(now, 15);
    }
    // The provider is back: the text is read.
    const back = await drainWith(item, (text) => echoParse(text), now);
    expect(back.kind).toBe("done");
  });

  it("keeps the count of refusals across an outage between them, never resetting it (review I2)", async () => {
    let item = queued;
    const sequence = [refuses, () => ({ unavailableWith: 500 }) as const, refuses];
    for (const reply of sequence) {
      const drained = await drainWith(item, reply);
      expect(drained.kind).toBe("wait");
      if (drained.kind !== "wait") {
        return;
      }
      item = drained.item;
    }
    expect(item.blindTries).toBe(BLIND_TRIES - 1);
    expect((await drainWith(item, refuses)).kind).toBe("inbox");
  });
});
