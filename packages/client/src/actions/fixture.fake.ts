import type { Event } from "@pace/core";

import { artboardEvents, MOSCOW, NOW } from "@pace/core/testing";

import type { Clock } from "../clock.ts";

import { createMemoryEventStore } from "../adapters/memory-event-store.ts";
import { type AppStateHandle, createAppState } from "../state.ts";
import { type Actions, createActions } from "./actions.ts";

export type ActionsWorld = {
  readonly actions: Actions;
  readonly state: AppStateHandle;
  /** Moves the frozen clock; the next action reads the new instant. */
  readonly setNow: (iso: string) => void;
  readonly rematerializeCalls: () => number;
};

/** The artboard world in a memory store, driven by the web client with a frozen clock. */
export const setupActions = async (
  seed: readonly Event[] = artboardEvents(),
): Promise<ActionsWorld> => {
  const store = createMemoryEventStore();
  await store.append(seed);
  await store.markSynced(seed.map((event) => event.id));
  let now = NOW;
  const clock: Clock = { deviceTz: MOSCOW, now: () => now };
  const inner = createAppState({ deviceId: "dev-1", now: clock.now, source: "web", store });
  let rematerializeCalls = 0;
  const state: AppStateHandle = {
    ...inner,
    rematerialize: async () => {
      rematerializeCalls += 1;
      await inner.rematerialize();
    },
  };
  await state.ready;
  return {
    actions: createActions({ clock, source: "web", state }),
    rematerializeCalls: () => rematerializeCalls,
    setNow: (iso) => {
      now = iso;
    },
    state,
  };
};

/** Unwraps a successful action; a failure fails the test with its code. */
export const unwrap = <T>(
  result: { readonly ok: false; readonly error: string } | { readonly ok: true; readonly value: T },
): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};
