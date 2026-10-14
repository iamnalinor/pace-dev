import { describe, expect, it } from "vitest";

import type { EventInput } from "@pace/core";

import { artboardState, NOW, REPLY_ID } from "@pace/core/testing";

import type { BotStoreApi, JsonValue } from "../shared/contract.ts";
import type { Turn } from "./turn.ts";

import { echoReply, fakeParseModel } from "../shared/llm/fake-model.ts";
import { choosePreview, preview, PREVIEW_ACTIONS } from "./preview.ts";

/** A store in memory: what the bot remembers, and every batch it writes. */
const memoryStore = () => {
  const kept = new Map<string, JsonValue>();
  const written: (readonly EventInput[])[] = [];
  const store = {
    apply: async (inputs: readonly EventInput[]) => {
      await Promise.resolve();
      written.push(inputs);
      return { ok: true, value: { events: [], seq: 0, state: artboardState() } };
    },
    enqueueParse: async () => {
      await Promise.resolve();
    },
    llmCooldowns: async () => ({}),
    logDecisions: async () => {
      await Promise.resolve();
    },
    noteLlmLimits: async () => {
      await Promise.resolve();
    },
    recall: async (key: string) => kept.get(key),
    remember: async (key: string, value: JsonValue) => {
      await Promise.resolve();
      kept.set(key, value);
    },
  } as unknown as BotStoreApi;
  return { store, written };
};

const LATER = "2026-10-06T12:30:00.000Z";

describe("the bot's preview", () => {
  it("writes what was accepted at the moment of Accept, not when it was previewed", async () => {
    const { store, written } = memoryStore();
    const turn = (now: string): Turn => ({ now, state: artboardState(now), store });
    const shown = await preview(
      turn(NOW),
      [{ model: fakeParseModel(echoReply), name: "fake" }],
      "close task Reply to course curator",
    );
    const accept = shown.buttons[0]?.find((button) => button.data.startsWith("a:"));
    expect(accept).toBeDefined();
    const id = accept?.data.slice(2) ?? "";
    expect(written).toEqual([]);
    await choosePreview(turn(LATER), PREVIEW_ACTIONS.accept, id);
    expect(written).toEqual([
      [
        expect.objectContaining({
          occurredAt: LATER,
          payload: { outcome: "done", taskId: REPLY_ID },
          type: "task.closed",
        }),
      ],
    ]);
  });
});
