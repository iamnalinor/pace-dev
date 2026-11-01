import { describe, expect, it } from "vitest";

import type { Event } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createPaceClient, type PaceClient } from "./create-client.ts";
import { at, createFakeFetch, FAKE_STORE_ID, fakeMe, settingsEvent } from "./fake-fetch.fake.ts";
import { createFakeSyncServer } from "./fake-sync-server.fake.ts";
import { parseStoreChange, type PeerTabs } from "./peer-tabs.ts";
import { createMemorySessionStore } from "./session.ts";

const NOW = "2026-10-06T12:00:00.000Z";
const DEVICE = "dev-1";

/**
The tabs of one browser profile, as a BroadcastChannel joins them: a message reaches every
other tab, a moment later (never the tab that sent it), as a structured clone.
*/
const fakePeers = () => {
  const tabs = new Set<(message: unknown) => void>();
  const sent: unknown[] = [];
  const tab = (): PeerTabs => {
    let own: ((message: unknown) => void) | undefined;
    return {
      listen: (onMessage) => {
        own = onMessage;
        tabs.add(onMessage);
        return () => {
          tabs.delete(onMessage);
        };
      },
      post: (change) => {
        sent.push(change);
        const copy: unknown = structuredClone(change);
        for (const listener of tabs) {
          if (listener !== own) {
            queueMicrotask(() => {
              listener(copy);
            });
          }
        }
      },
    };
  };
  return { sent, tab };
};

/**
Two tabs of one profile: one device id, one local store (IndexedDB is per profile), one server.
*/
const twoTabs = async () => {
  const server = createFakeSyncServer(FAKE_STORE_ID);
  const fake = createFakeFetch({ ...server.routes, "GET /api/me": () => fakeMe });
  const store = createMemoryEventStore();
  const peers = fakePeers();
  const open = async (): Promise<PaceClient> => {
    const session = createMemorySessionStore();
    await session.set("tok");
    const client = createPaceClient({
      baseUrl: "https://api.test",
      createSocket: server.createSocket,
      deviceId: DEVICE,
      fetch: fake.fetch,
      now: () => NOW,
      peers: peers.tab(),
      session,
      source: "web",
      store,
    });
    await client.auth.ready;
    await client.state.ready;
    client.live.start();
    server.connect();
    return client;
  };
  const first = await open();
  const second = await open();
  return { fake, first, peers, second, server, store };
};

const languageOf = (client: PaceClient): string => client.state.store.getState().settings.language;

/** Lets the queued peer messages and the state's queue settle. */
const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

describe("tabs of one profile (QA round 17 M1)", () => {
  it("a change written in one tab shows in the other, and the other tab calls nothing", async () => {
    const { fake, first, second, server } = await twoTabs();
    await first.state.dispatch({
      occurredAt: at(10),
      payload: { language: "ru" },
      type: "settings.updated",
    });
    await first.sync.syncNow();
    const requests = server.requests.length;
    const calls = fake.calls.length;
    await settle();
    expect(languageOf(second)).toBe("ru");
    // The server tells no socket of the writing device (one writer per device id); the tabs of
    // that device hear it from each other, so the second tab neither pulls nor is told.
    expect(server.requests).toHaveLength(requests);
    expect(fake.calls).toHaveLength(calls);
    // And the steady state: the second tab runs a sync of its own and finds nothing to do.
    await second.sync.syncNow();
    await settle();
    expect(languageOf(second)).toBe("ru");
    expect(languageOf(first)).toBe("ru");
    first.live.stop();
    second.live.stop();
  });

  it("another device's change pulled by one tab reaches the other through the shared copy", async () => {
    const { first, second, server } = await twoTabs();
    second.live.stop();
    server.append([{ ...settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(9), { language: "ru" }) }]);
    await first.sync.syncNow();
    await settle();
    // The second tab's cursor moved with the first's (one store): only the peer message tells it.
    expect(languageOf(second)).toBe("ru");
    first.live.stop();
  });

  it("a copy dropped in one tab (log out, a reset store) empties the other", async () => {
    const { first, second, store } = await twoTabs();
    await first.state.dispatch({
      occurredAt: at(10),
      payload: { language: "ru" },
      type: "settings.updated",
    });
    await settle();
    expect(second.state.store.getState().events).toHaveLength(1);
    await store.clear();
    await first.state.rematerialize();
    await settle();
    expect(second.state.store.getState().events).toHaveLength(0);
    first.live.stop();
    second.live.stop();
  });

  it("each tab tells the others only what it wrote or pulled, never what it heard (no echo)", async () => {
    const { first, peers } = await twoTabs();
    await first.state.dispatch({
      occurredAt: at(10),
      payload: { language: "ru" },
      type: "settings.updated",
    });
    await settle();
    expect(peers.sent).toHaveLength(1);
    first.live.stop();
  });
});

describe("parseStoreChange", () => {
  it("keeps the valid events of a message and refuses anything else", () => {
    const event: Event = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAC", at(9), { language: "ru" });
    expect(parseStoreChange({ events: [event, { id: 1 }], kind: "events" })).toEqual({
      events: [event],
      kind: "events",
    });
    expect(parseStoreChange({ kind: "reload" })).toEqual({ kind: "reload" });
    for (const message of [null, "reload", { kind: "other" }, { events: "x", kind: "events" }]) {
      expect(parseStoreChange(message)).toBeNull();
    }
  });
});
