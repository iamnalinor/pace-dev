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
} from "./checkpoint-sync.fake.ts";
import { at } from "./fake-fetch.fake.ts";

/*
A checkpoint copy's tail is read the way the legacy pull reads its pages (bug-lessons 13, 150;
PR 55 review I3): an event a newer client wrote that this build cannot read is left out and the
cursor moves on, a source it has no word for stands in as `system`. Only the pinned read of the
complete history stays strict: there, a gap is a gap.
*/

/** What a newer client wrote: an event type this build does not have. */
const unknownType = {
  ...old,
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAC",
  occurredAt: at(10),
  payload: { anything: true },
  recordedAt: at(10),
  type: "future.thing",
} as unknown as Event;
/** A known event from a source a newer server added. */
const unknownSource = {
  ...old,
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAD",
  occurredAt: at(10, 30),
  payload: { language: "en" },
  recordedAt: at(10, 30),
  source: "watch",
} as unknown as Event;

/** A correction in the tail: the base cannot take it, so the run needs the source. */
const revokeOld = {
  ...old,
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAE",
  occurredAt: at(10, 45),
  payload: { targetId: old.id },
  recordedAt: at(10, 45),
  type: "event.revoked",
} as Event;

describe.each(["http", "socket"] as const)(
  "a checkpoint copy whose source holds an event this build cannot read, over %s",
  (mode) => {
    it("becomes a full copy the tolerant way when a correction needs the source, and sends its outbox", async () => {
      const server = await checkpointServer();
      const disk = await ownedDisk();
      const { client, fake } = await startClient(server, disk, { mode });
      await client.sync.syncNow();
      expect((await disk.readMeta()).coverage).toBe("checkpoint");
      // An unreadable event the tail skipped, then a correction the base cannot take: its source
      // read now covers the unreadable one (bug-lessons 361).
      server.append([unknownType]);
      await client.sync.syncNow();
      expect(await disk.readMeta()).toMatchObject({ coverage: "checkpoint", cursor: 2 });
      server.append([revokeOld]);
      const written = await client.state.dispatch(languageChange);

      expect(await client.sync.syncNow()).toMatchObject({ ok: true, value: { pushed: 1 } });

      expect(await disk.readMeta()).toMatchObject({ coverage: "full", cursor: 4, storeId: "one" });
      expect(await disk.listPending()).toEqual([]);
      expect(server.log().map((event) => event.id)).toContain(written.ok ? written.value.id : "?");
      expect(client.state.store.getState()).toMatchObject({
        historyCoverage: "full",
        settings: { language: "en" },
        status: "ready",
      });
      expect(client.sync.status.getState()).toMatchObject({ lastError: null });

      // Settled: the next run makes one pull and nothing else.
      const calls = fake.calls.length;
      const socketRequests = server.requests.length;
      expect(await client.sync.syncNow()).toEqual({ ok: true, value: { pulled: 0, pushed: 0 } });
      const requests = [
        ...fake.calls.slice(calls).map((call) => call.path),
        ...server.requests
          .slice(socketRequests)
          .filter((request) => request.transport === "socket")
          .map((request) => request.type),
      ];
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatch(/pull/);
      client.live.stop();
      client.close();
    });
  },
);

describe.each(["http", "socket"] as const)("a checkpoint copy's tail over %s", (mode) => {
  it("skips an event this build cannot read, keeps the rest and moves the cursor past it", async () => {
    const server = await checkpointServer();
    const disk = await ownedDisk();
    const { client, fake } = await startClient(server, disk, { mode });
    await client.sync.syncNow();
    server.append([unknownType, unknownSource, newer]);

    expect(await client.sync.syncNow()).toMatchObject({ ok: true });
    expect(client.sync.status.getState()).toMatchObject({ lastError: null, online: true });
    expect(await disk.readMeta()).toMatchObject({ coverage: "checkpoint", cursor: 4 });
    expect(await logOf(disk)).toEqual([{ ...unknownSource, source: "system" }, newer]);
    expect(client.state.store.getState()).toMatchObject({
      settings: { language: "en", timezone: "Europe/Moscow" },
      status: "ready",
    });

    // Settled: the skipped event is not asked for again.
    const pulls = server.requests.filter((request) => request.type === "pull").length;
    expect(await client.sync.syncNow()).toEqual({ ok: true, value: { pulled: 0, pushed: 0 } });
    expect(server.requests.filter((request) => request.type === "pull")).toHaveLength(pulls + 1);
    expect(fake.pathsCalled("/api/sync/bootstrap")).toHaveLength(1);
    client.live.stop();
    client.close();
  });
});

describe("a checkpoint copy's tail", () => {
  it("applies a page the server sent unasked that carries an event this build cannot read", async () => {
    const server = await checkpointServer();
    const disk = await ownedDisk();
    const { client } = await startClient(server, disk, { mode: "socket" });
    await client.sync.syncNow();
    const pulls = server.requests.filter((request) => request.type === "pull").length;
    server.append([unknownType, newer]);
    await expect.poll(async () => (await disk.readMeta()).cursor).toBe(3);
    expect(await logOf(disk)).toEqual([newer]);
    // The page was taken as it came: no pull was needed to get past the unknown event.
    expect(server.requests.filter((request) => request.type === "pull")).toHaveLength(pulls);
    client.live.stop();
    client.close();
  });

  it("starts from a checkpoint whose first tail page carries an event this build cannot read", async () => {
    const server = await checkpointServer();
    server.append([unknownType, newer]);
    const disk = await ownedDisk();
    const { client } = await startClient(server, disk);
    expect(await client.sync.syncNow()).toMatchObject({ ok: true });
    expect(await disk.readMeta()).toMatchObject({ coverage: "checkpoint", cursor: 3 });
    expect(await logOf(disk)).toEqual([newer]);
    expect(client.state.store.getState().settings).toMatchObject({
      language: "ru",
      timezone: "Europe/Moscow",
    });
    client.close();
  });

  it("still refuses a complete history with an event this build cannot read", async () => {
    const server = await checkpointServer();
    server.append([unknownType, newer]);
    const disk = await ownedDisk();
    const { client } = await startClient(server, disk);
    await client.sync.syncNow();
    expect(await client.history.ensureComplete()).toEqual({
      ok: false,
      error: "history/incomplete",
    });
    expect((await disk.readMeta()).coverage).toBe("checkpoint");
    client.close();
  });
});
