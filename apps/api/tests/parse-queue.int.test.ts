import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addMinutesIso, newId } from "@pace/core";

import { queueOf } from "../src/user-store/parse-queue.ts";
import { UserStore } from "../src/user-store/user-store.ts";

/** The store's clock, frozen far ahead of the real one (bug-lessons classes 9 and 54). */
const NOW = "2099-10-07T19:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

const titles = async (store: UserStore, now: string): Promise<readonly string[]> =>
  Object.values((await store.read(now)).state.tasks.byId).map((task) => task.title);

describe("a text read later, its drain cut short", () => {
  it("is written once: a drain cut short after the write and run again adds no second copy", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const store = new UserStore(state, env);
      await store.enqueueParse({ channel: "api", retryAt: null, text: "купить хлеб" }, NOW);
      // The reading is written, then the isolate is reset before the queue is saved (here: the
      // decision log after the write fails, so nothing after it runs).
      const cut = new UserStore(state, env);
      Object.defineProperty(cut, "logDecisions", {
        value: async () => {
          throw new Error("cut short");
        },
      });
      await expect(cut.drainParses(NOW)).rejects.toThrow("cut short");
      expect(await titles(store, NOW)).toHaveLength(1);
      expect(await queueOf(state.storage)).toHaveLength(1);
      // The alarm runs the drain again on a new instance.
      const later = addMinutesIso(NOW, 1);
      vi.setSystemTime(new Date(later));
      const again = new UserStore(state, env);
      await again.drainParses(later);
      expect(await titles(again, later)).toHaveLength(1);
      expect(await queueOf(state.storage)).toEqual([]);
    });
  });

  it("does not read a text again once its reading is in the log (a drain cut short as it tells)", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const store = new UserStore(state, env);
      await store.enqueueParse({ channel: "api", retryAt: null, text: "купить хлеб" }, NOW);
      // Written and logged; the isolate is reset as the person is told (here: the chat lookup).
      const cut = new UserStore(state, env);
      Object.defineProperty(cut, "chatId", {
        value: async () => {
          throw new Error("cut short");
        },
      });
      await expect(cut.drainParses(NOW)).rejects.toThrow("cut short");
      const later = addMinutesIso(NOW, 1);
      vi.setSystemTime(new Date(later));
      await new UserStore(state, env).drainParses(later);
      // Read once, logged once: a second reading could have come out otherwise.
      expect(await store.decisions({ limit: 10, q: "parse.deferred" })).toHaveLength(1);
      expect(await queueOf(state.storage)).toEqual([]);
    });
  });

  it("keeps a text in the Inbox once when that drain is cut short and run again", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const store = new UserStore(state, env);
      const task = {
        deviceId: "dev-1",
        id: newId(),
        occurredAt: NOW,
        payload: { presetId: "personal", subtasks: [], taskId: "t-bike", title: "Fix the bike" },
        precision: "exact",
        recordedAt: NOW,
        source: "app",
        type: "task.created",
      };
      await store.append([task], { now: NOW });
      // A delete read later is never done unseen: the text goes to the Inbox.
      const text = "delete task Fix the bike";
      await store.enqueueParse({ channel: "api", retryAt: null, text }, NOW);
      const cut = new UserStore(state, env);
      Object.defineProperty(cut, "logDecisions", {
        value: async () => {
          throw new Error("cut short");
        },
      });
      await expect(cut.drainParses(NOW)).rejects.toThrow("cut short");
      const later = addMinutesIso(NOW, 1);
      vi.setSystemTime(new Date(later));
      const again = new UserStore(state, env);
      await again.drainParses(later);
      expect((await titles(again, later)).filter((title) => title === text)).toHaveLength(1);
      expect(await queueOf(state.storage)).toEqual([]);
    });
  });
});
