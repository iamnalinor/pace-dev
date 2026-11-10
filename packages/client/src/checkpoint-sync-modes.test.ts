import { describe, expect, it } from "vitest";

import type { Event } from "@pace/core";

import {
  checkpointServer,
  languageChange,
  logOf,
  newer,
  old,
  ownedDisk,
  startClient,
  withUnreadableBase,
} from "./checkpoint-sync.fake.ts";
import { at } from "./fake-fetch.fake.ts";

/*
Which path a copy syncs on, and how it moves between them (PR 55 review I1, I2, I7): a
checkpoint-coverage copy on a server that stopped offering checkpoints, a full copy on one that
offers them, and the one outbox push both paths share.
*/

describe("a checkpoint copy on a server that stopped offering checkpoints", () => {
  it("becomes a full copy by a pull from the start, keeps its outbox and sends it", async () => {
    const server = await checkpointServer();
    const disk = await ownedDisk();
    const first = await startClient(server, disk);
    await first.client.sync.syncNow();
    expect((await disk.readMeta()).coverage).toBe("checkpoint");
    first.client.close();

    // The flag is rolled back (or this build reads the server's checkpoint version as none).
    delete server.options.historyCheckpoint;
    const second = await startClient(server, disk);
    const written = await second.client.state.dispatch(languageChange);
    expect(await second.client.sync.syncNow()).toMatchObject({ ok: true, value: { pushed: 1 } });

    expect(await disk.readMeta()).toMatchObject({ coverage: "full", cursor: 2, storeId: "one" });
    expect(await disk.listPending()).toEqual([]);
    expect(server.log().map((event) => event.id)).toEqual([
      old.id,
      written.ok ? written.value.id : "",
    ]);
    expect(new Set(await logOf(disk))).toEqual(new Set(server.log()));
    expect(second.client.state.store.getState()).toMatchObject({
      historyCoverage: "full",
      checkpoint: null,
      settings: { language: "en" },
      status: "ready",
    });
    expect(second.fake.pathsCalled("/api/sync/bootstrap")).toEqual([]);

    // Settled: the next run pulls its cursor's tail once and reports nothing wrong.
    const pulls = second.fake.pathsCalled("/api/sync/pull").length;
    expect(await second.client.sync.syncNow()).toEqual({
      ok: true,
      value: { pulled: 0, pushed: 0 },
    });
    expect(second.fake.pathsCalled("/api/sync/pull")).toHaveLength(pulls + 1);
    expect(second.client.sync.status.getState()).toMatchObject({ lastError: null, online: true });
    second.client.close();
  });
});

describe("a full copy on a server that offers checkpoints", () => {
  it("pulls its tail after a restart: no bootstrap, and the complete history stays", async () => {
    const server = await checkpointServer();
    const disk = await ownedDisk();
    const first = await startClient(server, disk);
    await first.client.sync.syncNow();
    expect(await first.client.history.ensureComplete()).toEqual({ ok: true, value: undefined });
    expect((await disk.readMeta()).coverage).toBe("full");
    first.client.close();

    server.append([newer]);
    const second = await startClient(server, disk);
    expect(await second.client.sync.syncNow()).toEqual({
      ok: true,
      value: { pulled: 1, pushed: 0 },
    });
    expect(second.fake.pathsCalled("/api/sync/bootstrap")).toEqual([]);
    expect(await disk.readMeta()).toMatchObject({ coverage: "full", cursor: 2 });
    expect(await logOf(disk)).toEqual([old, newer]);
    expect(second.client.state.store.getState()).toMatchObject({
      historyCoverage: "full",
      log: [old, newer],
      settings: { language: "ru", timezone: "Europe/Moscow" },
    });
    await second.client.sync.syncNow();
    expect(second.fake.pathsCalled("/api/sync/bootstrap")).toEqual([]);
    second.client.close();
  });
});

describe("the outbox of a checkpoint copy", () => {
  it("reports a rejected event as the legacy run does: the run succeeds and names it", async () => {
    const server = await checkpointServer();
    const disk = await ownedDisk();
    const { client } = await startClient(server, disk, {
      routes: {
        "POST /api/sync/push": ({ body }) => ({
          accepted: [],
          rejected: (body as { readonly events: readonly Event[] }).events.map((event) => ({
            id: event.id,
            reason: "invalid",
          })),
          seq: 1,
        }),
      },
    });
    const written = await client.state.dispatch(languageChange);
    const id = written.ok ? written.value.id : "";
    expect(await client.sync.syncNow()).toMatchObject({ ok: true, value: { pushed: 0 } });
    expect(client.sync.status.getState()).toMatchObject({
      lastError: `push rejected: ${id} (invalid)`,
      lastSyncAt: at(12),
      online: true,
    });
    client.close();
  });

  it("marks what the server accepted as sent before any page brings it back", async () => {
    const server = await checkpointServer();
    const disk = await ownedDisk();
    const { client } = await startClient(server, disk, {
      routes: {
        // The store took the event; this run's pages do not carry it yet.
        "POST /api/sync/push": ({ body }) => ({
          accepted: (body as { readonly events: readonly Event[] }).events.map((event) => event.id),
          rejected: [],
          seq: 1,
        }),
      },
    });
    await client.state.dispatch(languageChange);
    expect(await client.sync.syncNow()).toMatchObject({ ok: true, value: { pushed: 1 } });
    expect(await disk.listPending()).toEqual([]);
    client.close();
  });
});

/** A device with a checkpoint copy and one action written offline, as its last run left it. */
const stale = async () => {
  const server = await checkpointServer();
  const disk = await ownedDisk();
  const first = await startClient(server, disk);
  await first.client.sync.syncNow();
  const written = await first.client.state.dispatch(languageChange);
  first.client.close();
  return { server, disk, id: written.ok ? written.value.id : "" };
};

describe("a checkpoint copy whose stored base this build cannot read", () => {
  it("shows nothing as ready and takes no action, but keeps the outbox", async () => {
    const { server, disk, id } = await stale();
    const { client } = await startClient(server, withUnreadableBase(disk));
    expect(client.state.store.getState()).toMatchObject({ status: "loading", checkpoint: null });
    expect(await client.state.dispatch(languageChange)).toEqual({
      ok: false,
      error: "history/not-loaded",
    });
    expect((await disk.listPending()).map((event) => event.id)).toEqual([id]);
    client.close();
  });

  it("is repaired by the next run from the server's checkpoint, and the outbox goes out", async () => {
    const { server, disk, id } = await stale();
    const { client, fake } = await startClient(server, withUnreadableBase(disk));
    expect(await client.sync.syncNow()).toMatchObject({ ok: true, value: { pushed: 1 } });
    expect(fake.pathsCalled("/api/sync/bootstrap")).toHaveLength(1);
    expect(client.state.store.getState()).toMatchObject({
      historyCoverage: "checkpoint",
      settings: { language: "en" },
      status: "ready",
    });
    expect(server.log().map((event) => event.id)).toEqual([old.id, id]);
    expect(await disk.listPending()).toEqual([]);
    expect(client.sync.status.getState().lastError).toBeNull();
    client.close();
  });

  it("is repaired by the legacy pull when the server offers no checkpoint this build reads", async () => {
    const { server, disk, id } = await stale();
    delete server.options.historyCheckpoint;
    const { client, fake } = await startClient(server, withUnreadableBase(disk));
    expect(await client.sync.syncNow()).toMatchObject({ ok: true, value: { pushed: 1 } });
    expect(fake.pathsCalled("/api/sync/bootstrap")).toEqual([]);
    expect(await disk.readMeta()).toMatchObject({ coverage: "full", cursor: 2 });
    expect(client.state.store.getState()).toMatchObject({
      historyCoverage: "full",
      settings: { language: "en" },
      status: "ready",
    });
    expect(server.log().map((event) => event.id)).toEqual([old.id, id]);
    expect(await disk.listPending()).toEqual([]);
    client.close();
  });
});
