import { createHash } from "node:crypto";

import { type Checkpoint, createCheckpoint, type Event } from "@pace/core";

import type { EventStore } from "./event-store.ts";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createPaceClient, type PaceClient } from "./create-client.ts";
import {
  at,
  createFakeFetch,
  type FakeFetch,
  fakeMe,
  type FakeRoute,
  settingsEvent,
} from "./fake-fetch.fake.ts";
import { createFakeSyncServer, type FakeSyncServer } from "./fake-sync-server.fake.ts";
import { createMemorySessionStore } from "./session.ts";

/* A server that offers a checkpoint over its first event, and app starts on one device's copy. */

export const old = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(8), { language: "ru" });
export const newer = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(11), {
  timezone: "Europe/Moscow",
});
export const languageChange = {
  occurredAt: at(10),
  payload: { language: "en" },
  type: "settings.updated",
} as const;

export const sha256 = async (text: string): Promise<string> =>
  createHash("sha256").update(text).digest("hex");

/** The checkpoint of a store whose log is `old` alone. */
export const oldCheckpoint = (): Checkpoint => {
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
  return checkpoint.value;
};

export const checkpointServer = async (): Promise<FakeSyncServer> => {
  const server = createFakeSyncServer("one");
  server.append([old]);
  const json = JSON.stringify(oldCheckpoint());
  server.options.historyCheckpoint = { json, sha256: await sha256(json), coveredSeq: 1 };
  return server;
};

/** One app start on the device's copy: a new runtime, which asks the server what it offers again. */
export const startClient = async (
  server: FakeSyncServer,
  disk: EventStore,
  {
    routes = {},
    mode = "http",
  }: {
    readonly routes?: Readonly<Record<string, FakeRoute>>;
    readonly mode?: "http" | "socket";
  } = {},
): Promise<{ readonly client: PaceClient; readonly fake: FakeFetch }> => {
  const session = createMemorySessionStore();
  await session.set("token");
  const fake = createFakeFetch({ ...server.routes, "GET /api/me": () => fakeMe, ...routes });
  const client = createPaceClient({
    baseUrl: "https://api.test",
    source: "web",
    deviceId: "device",
    now: () => at(12),
    session,
    store: disk,
    fetch: fake.fetch,
    createSocket: server.createSocket,
    sha256Text: sha256,
  });
  await client.auth.ready;
  await client.state.ready;
  if (mode === "socket") {
    client.live.start();
    server.connect();
  }
  return { client, fake };
};

export const ownedDisk = async (): Promise<EventStore> => {
  const disk = createMemoryEventStore();
  await disk.setOwner("owner");
  return disk;
};

/** The copy's events in the order stored. */
export const logOf = async (disk: EventStore): Promise<readonly Event[]> => {
  const copy = await disk.readSnapshot();
  return copy.records.map((record) => record.event);
};

/**
The copy as a build that cannot read its stored base sees it (an update changed the checkpoint
version, or the row is corrupt): the adapters answer a checkpoint copy with no base. It reads
whole again once a run replaced the base or turned the copy into a full one.
*/
export const withUnreadableBase = (disk: EventStore): EventStore => {
  let isUnreadable = true;
  const repaired = <T extends { readonly ok: boolean }>(result: T): T => {
    isUnreadable &&= !result.ok;
    return result;
  };
  return {
    ...disk,
    readSnapshot: async () => {
      const copy = await disk.readSnapshot();
      return isUnreadable && copy.coverage === "checkpoint" ? { ...copy, checkpoint: null } : copy;
    },
    installBootstrap: async (input) => repaired(await disk.installBootstrap(input)),
    installHistory: async (input) => repaired(await disk.installHistory(input)),
    applyLegacyPage: async (input) => repaired(await disk.applyLegacyPage(input)),
  };
};
