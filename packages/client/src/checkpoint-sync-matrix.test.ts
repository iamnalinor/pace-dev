import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createCheckpoint, type Event } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createPaceClient } from "./create-client.ts";
import { at, createFakeFetch, fakeMe, settingsEvent } from "./fake-fetch.fake.ts";
import { createFakeSyncServer } from "./fake-sync-server.fake.ts";
import { createMemorySessionStore } from "./session.ts";

const old = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(8), { language: "ru" });
const hash = async (text: string) => createHash("sha256").update(text).digest("hex");
const setup = async (mode: "http" | "socket", pending?: Event) => {
  const server = createFakeSyncServer("one");
  server.append([old]);
  const checkpoint = createCheckpoint({
    storeId: "one",
    build: "opaque-release",
    coveredSeq: 1,
    cutoff: at(9),
    cutoffTimezone: "UTC",
    records: [{ seq: 1, event: old }],
  });
  if (!checkpoint.ok) {
    throw new Error(checkpoint.error);
  }
  const json = JSON.stringify(checkpoint.value);
  server.options.historyCheckpoint = { json, sha256: await hash(json), coveredSeq: 1 };
  const disk = createMemoryEventStore();
  await disk.setOwner("owner");
  if (pending !== undefined) {
    await disk.append([pending], await disk.readMeta());
  }
  const session = createMemorySessionStore();
  await session.set("token");
  const fake = createFakeFetch({ ...server.routes, "GET /api/me": () => fakeMe });
  const client = createPaceClient({
    baseUrl: "https://api.test",
    source: "web",
    deviceId: "device",
    now: () => at(12),
    session,
    store: disk,
    fetch: fake.fetch,
    createSocket: server.createSocket,
    sha256Text: hash,
  });
  await client.auth.ready;
  await client.state.ready;
  if (mode === "socket") {
    client.live.start();
    server.connect();
  }
  return { client, disk, server, fake };
};
describe.each(["http", "socket"] as const)("checkpoint sync over %s", (mode) => {
  it("retains same-generation offline outbox, adopts canonical tail and stops bootstrapping", async () => {
    const { client, disk, server, fake } = await setup(mode);
    await client.state.dispatch({
      type: "settings.updated",
      occurredAt: at(10),
      payload: { language: "en" },
    });
    expect(await client.sync.syncNow()).toMatchObject({
      ok: true,
      value: { pulled: 1, pushed: 1 },
    });
    expect(await disk.listPending()).toEqual([]);
    expect(client.state.store.getState()).toMatchObject({
      historyCoverage: "checkpoint",
      settings: { language: "en" },
    });
    expect(server.log()).toHaveLength(2);
    await client.sync.syncNow();
    expect(fake.pathsCalled("/api/sync/bootstrap")).toHaveLength(1);
    expect(fake.pathsCalled("/api/instance")).toHaveLength(1);
    expect(server.requests.every((request) => request.transport === mode)).toBe(true);
    expect(client.sync.status.getState()).toMatchObject({ syncing: false, lastError: null });
    client.live.stop();
    client.close();
  });
  it("reconciles an overlapping base ID from complete canonical source before acknowledging", async () => {
    const { client, disk, server, fake } = await setup(
      mode,
      settingsEvent(old.id, old.occurredAt, { language: "en" }),
    );
    expect(await client.sync.syncNow()).toMatchObject({ ok: true, value: { pushed: 0 } });
    expect(await disk.listPending()).toEqual([]);
    expect(client.state.store.getState()).toMatchObject({
      historyCoverage: "full",
      settings: { language: "ru" },
      log: [old],
    });
    expect(server.log()).toEqual([old]);
    expect(fake.calls.filter((call) => call.path === "/api/sync/pull")).toHaveLength(
      mode === "http" ? 2 : 1,
    );
    client.live.stop();
    client.close();
  });
  it("drops a foreign-generation outbox while preserving ownership and settles after reset", async () => {
    const { client, disk, server } = await setup(mode);
    await client.sync.syncNow();
    await client.state.dispatch({
      type: "settings.updated",
      occurredAt: at(10),
      payload: { language: "en" },
    });
    const before = await disk.readSnapshot();
    server.options.historyCheckpoint = null;
    server.wipe("two");
    expect(await client.sync.syncNow()).toMatchObject({ ok: true, value: { pushed: 0 } });
    const after = await disk.readSnapshot();
    expect(after).toMatchObject({
      storeId: "two",
      cursor: 0,
      owner: "owner",
      pendingIds: [],
      coverage: "full",
    });
    expect(after.copyToken).not.toBe(before.copyToken);
    expect(client.state.store.getState().knownEventIds.size).toBe(0);
    expect(server.log()).toEqual([]);
    await client.sync.syncNow();
    expect(client.sync.status.getState().lastError).toBeNull();
    client.live.stop();
    client.close();
  });
});
