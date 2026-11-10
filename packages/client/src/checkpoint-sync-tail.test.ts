import { describe, expect, it } from "vitest";

import type { Event } from "@pace/core";

import {
  checkpointServer,
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
