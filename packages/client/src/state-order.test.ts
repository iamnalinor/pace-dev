import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  coreReducer,
  effectiveInOrder,
  type Event,
  INITIAL_CORE_STATE,
  materialize,
} from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { at, settingsEvent } from "./fake-fetch.fake.ts";
import { pullPage, seedPending } from "./local-store.fake.ts";
import { createAppState } from "./state.ts";

const LOWER = "01ARZ3NDEKTSV4RRFFQ69G5FAA";
const HIGHER = "01ARZ3NDEKTSV4RRFFQ69G5FAB";
const CORRECTION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAC";

it("matches full replay for correction chains arriving before and after their targets", async () => {
  const correction: Event = {
    ...settingsEvent(CORRECTION_ID, at(8), {}),
    type: "event.revoked",
    payload: { targetId: LOWER },
  };
  const amendment: Event = {
    ...settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAD", at(9), {}),
    type: "event.amended",
    payload: { targetId: LOWER, patch: { language: "en" } },
  };
  const restored: Event = {
    ...settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAE", at(9), {}),
    type: "event.revoked",
    payload: { targetId: CORRECTION_ID },
  };
  const events = [
    settingsEvent(HIGHER, at(7), { language: "ru" }),
    correction,
    amendment,
    restored,
    settingsEvent(LOWER, at(10), { language: "ru" }),
  ];
  await fc.assert(
    fc.asyncProperty(
      fc.shuffledSubarray(events, { minLength: events.length }),
      fc.constantFrom("dispatch", "page"),
      async (shuffled, arrival) => {
        const store = createMemoryEventStore();
        const state = createAppState({
          deviceId: "phone",
          now: () => at(11),
          source: "app",
          store,
        });
        await state.ready;
        for (const [index, event] of shuffled.entries()) {
          let dispatched: Awaited<ReturnType<typeof state.dispatch>> | undefined;
          if (arrival === "dispatch") {
            dispatched = await state.dispatch(event);
          } else {
            await pullPage(state, store, [event]);
          }
          expect(dispatched?.ok).toBe(arrival === "dispatch" ? true : undefined);
          const prefix = shuffled.slice(0, index + 1);
          expect(state.store.getState().settings).toEqual(
            materialize(prefix, coreReducer, INITIAL_CORE_STATE).settings,
          );
          expect(state.store.getState().events).toEqual(effectiveInOrder(prefix));
        }
      },
    ),
  );
});

describe.each(["loaded", "same-session"] as const)(
  "corrections before their target (%s)",
  (source) => {
    it.each([
      { arrival: "dispatch", type: "event.revoked" },
      { arrival: "page", type: "event.revoked" },
      { arrival: "dispatch", type: "event.amended" },
      { arrival: "page", type: "event.amended" },
    ] as const)(
      "applies $type when $arrival later delivers its target",
      async ({ arrival, type }) => {
        const target = settingsEvent(LOWER, at(10), { language: "ru" });
        const correction: Event =
          type === "event.revoked"
            ? { ...settingsEvent(CORRECTION_ID, at(8), {}), type, payload: { targetId: target.id } }
            : {
                ...settingsEvent(CORRECTION_ID, at(8), {}),
                type,
                payload: { targetId: target.id, patch: { language: "en" } },
              };
        const store = createMemoryEventStore();
        await seedPending(store, [
          settingsEvent(HIGHER, at(9), { language: "en" }),
          ...(source === "loaded" ? [correction] : []),
        ]);
        const state = createAppState({
          deviceId: "phone",
          now: () => at(11),
          source: "app",
          store,
        });
        await state.ready;
        if (source === "same-session") {
          await pullPage(state, store, [correction]);
        }
        let dispatched: Awaited<ReturnType<typeof state.dispatch>> | undefined;
        if (arrival === "dispatch") {
          dispatched = await state.dispatch(target);
        } else {
          await pullPage(state, store, [target]);
        }
        expect(dispatched?.ok).toBe(arrival === "dispatch" ? true : undefined);
        const warm = state.store.getState();
        expect(warm.settings.language).toBe("en");
        expect(warm.events.find((event) => event.id === target.id)?.payload).toEqual(
          type === "event.revoked" ? undefined : { language: "en" },
        );
        await state.rematerialize();
        expect(state.store.getState().settings).toEqual(warm.settings);
        expect(state.store.getState().events).toEqual(warm.events);
      },
    );
  },
);

describe("canonical order across client batches", () => {
  it.each(["dispatch", "page"] as const)(
    "keeps the higher id's setting when %s delivers a lower id at the same instant",
    async (arrival) => {
      const high = settingsEvent(HIGHER, at(10), { language: "ru" });
      const low = settingsEvent(LOWER, at(10), { language: "en" });
      const store = createMemoryEventStore();
      await seedPending(store, [high]);
      const state = createAppState({ deviceId: "phone", now: () => at(11), source: "app", store });
      await state.ready;

      let dispatched: Awaited<ReturnType<typeof state.dispatch>> | undefined;
      if (arrival === "dispatch") {
        dispatched = await state.dispatch({
          id: low.id,
          occurredAt: low.occurredAt,
          payload: { language: "en" },
          type: "settings.updated",
        });
      } else {
        await pullPage(state, store, [low]);
      }
      expect(dispatched?.ok).toBe(arrival === "dispatch" ? true : undefined);

      const incremental = state.store.getState();
      expect(incremental.settings.language).toBe("ru");
      expect(incremental.events.map((event) => event.id)).toEqual([LOWER, HIGHER]);
      await state.rematerialize();
      expect(state.store.getState().settings).toEqual(incremental.settings);
      expect(state.store.getState().events).toEqual(incremental.events);
    },
  );
});
