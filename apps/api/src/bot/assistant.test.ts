import { describe, expect, it } from "vitest";

import type { BotStoreApi } from "../shared/contract.ts";

import { createAssistant, MAX_BOUND_PREVIEWS } from "./assistant.ts";

/** The store's memos in a map: all `bindPreview` touches. */
const memoStore = () => {
  const memos = new Map<string, unknown>();
  const store = {
    peek: async (key: string) => await memos.get(key),
    recall: async (key: string) => {
      const value = memos.get(key);
      memos.delete(key);
      return await value;
    },
    remember: async (key: string, value: unknown) => {
      memos.set(key, value);
      await Promise.resolve();
    },
  };
  return { memos, store: store as unknown as BotStoreApi };
};

describe("the bot's preview bindings", () => {
  it("keeps the latest previews only: an old one's binding and its preview go", async () => {
    const { memos, store } = memoStore();
    const assistant = createAssistant({
      now: () => "2026-10-18T10:00:00.000Z",
      providers: [],
      storeOf: () => store,
      userIdOf: async () => "user-1",
    });
    const total = MAX_BOUND_PREVIEWS + 3;
    for (let message = 1; message <= total; message += 1) {
      await store.remember(`preview-${String(message)}`, { text: "x" });
      await assistant.bindPreview("1001", `preview-${String(message)}`, message);
    }
    expect(memos.has("bot:message:1")).toBe(false);
    expect(memos.has("preview-1")).toBe(false);
    expect(memos.has("bot:message:3")).toBe(false);
    expect(memos.has(`bot:message:${String(total)}`)).toBe(true);
    expect(memos.has(`preview-${String(total)}`)).toBe(true);
    const bindings = memos
      .keys()
      .filter((key) => key.startsWith("bot:message:"))
      .toArray();
    expect(bindings).toHaveLength(MAX_BOUND_PREVIEWS);
  });
});
