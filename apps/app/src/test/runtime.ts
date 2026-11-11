import {
  type Clock,
  createMemoryEventStore,
  createMemorySessionStore,
  type EventStore,
} from "@pace/client";
import {
  createFakeFetch,
  emptySyncRoutes,
  fakeInstance,
  fakeMe,
  type FakeRoute,
  seedSynced,
} from "@pace/client/testing";
import { artboardEvents, MOSCOW, NOW } from "@pace/core/testing";

import { createRuntime, type PaceRuntime } from "../runtime.ts";

export type TestWorld = {
  /** The instant the clock is frozen at (the artboard's Tuesday 15:00 Moscow by default). */
  readonly now?: string;
  readonly deviceTz?: string;
  /** `artboard` replays the design's world up to `now`; `empty` starts from nothing. */
  readonly world?: "artboard" | "empty";
  /** Extra fake API routes (for example the assistant's parse). */
  readonly routes?: Readonly<Record<string, FakeRoute>>;
  /** The local log (a memory store by default); a test may make its writes fail. */
  readonly eventStore?: EventStore;
};

/** A clock that never moves, so every relative figure matches the artboards. */
export const frozenClock = ({ deviceTz = MOSCOW, now = NOW }: TestWorld = {}): Clock => ({
  deviceTz,
  now: () => now,
});

/** The local store behind each test runtime: what `pulledInto` writes the server's events into. */
const stores = new WeakMap<PaceRuntime, EventStore>();

/**
Events the server already holds, put into the runtime's copy as synced (through the store's
guarded writes) and shown: what an earlier sync left on the device.
*/
export const pulledInto = async (
  runtime: PaceRuntime,
  events: Parameters<typeof seedSynced>[1],
): Promise<void> => {
  const store = stores.get(runtime);
  if (store === undefined) {
    throw new Error("The runtime was not made by createTestRuntime");
  }
  await seedSynced(store, events);
  await runtime.state.rematerialize();
};

/** The app runtime on memory adapters, a fake API and a frozen clock, signed out (no sync). */
export const createTestRuntime = async (options: TestWorld = {}): Promise<PaceRuntime> => {
  const api = createFakeFetch({
    ...emptySyncRoutes,
    // A server this build fits: the versions screen stays out of the way unless a test asks.
    "GET /api/instance": () => fakeInstance,
    "GET /api/me": () => fakeMe,
    ...options.routes,
  });
  // The stored server (the build's by default), as the app builds it: the instance check counts.
  const eventStore = options.eventStore ?? createMemoryEventStore();
  const runtime = await createRuntime({
    clock: frozenClock(options),
    deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    eventStore,
    fetch: api.fetch,
    session: createMemorySessionStore(),
  });
  await runtime.state.ready;
  stores.set(runtime, eventStore);
  if (options.world !== "empty") {
    const until = options.now ?? NOW;
    await pulledInto(
      runtime,
      artboardEvents().filter((event) => event.occurredAt <= until),
    );
  }
  return runtime;
};
