import { type Clock, createMemoryEventStore, createMemorySessionStore } from "@pace/client";
import { createFakeFetch, emptySyncRoutes, type FakeRoute, fakeUser } from "@pace/client/testing";
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
};

/** A clock that never moves, so every relative figure matches the artboards. */
export const frozenClock = ({ deviceTz = MOSCOW, now = NOW }: TestWorld = {}): Clock => ({
  deviceTz,
  now: () => now,
});

/** The app runtime on memory adapters, a fake API and a frozen clock, signed out (no sync). */
export const createTestRuntime = async (options: TestWorld = {}): Promise<PaceRuntime> => {
  const api = createFakeFetch({
    ...emptySyncRoutes,
    "GET /api/me": () => fakeUser,
    ...options.routes,
  });
  const runtime = await createRuntime({
    baseUrl: "https://api.test",
    clock: frozenClock(options),
    deviceId: async () => "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    eventStore: createMemoryEventStore(),
    fetch: api.fetch,
    session: createMemorySessionStore(),
  });
  await runtime.state.ready;
  if (options.world !== "empty") {
    const until = options.now ?? NOW;
    await runtime.state.ingest(artboardEvents().filter((event) => event.occurredAt <= until));
  }
  return runtime;
};
