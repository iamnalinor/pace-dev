import { describe, expect, it } from "vitest";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { at, settingsEvent } from "./fake-fetch.fake.ts";
import { createAppState } from "./state.ts";

const LOWER = "01ARZ3NDEKTSV4RRFFQ69G5FAA";
const HIGHER = "01ARZ3NDEKTSV4RRFFQ69G5FAB";

describe("canonical order across client batches", () => {
  it.each(["dispatch", "ingest"] as const)(
    "keeps the higher id's setting when %s delivers a lower id at the same instant",
    async (arrival) => {
      const high = settingsEvent(HIGHER, at(10), { language: "ru" });
      const low = settingsEvent(LOWER, at(10), { language: "en" });
      const store = createMemoryEventStore();
      await store.append([high]);
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
        await state.ingest([low]);
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
