import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type Event, isUlid } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { at, settingsEvent } from "./fake-fetch.fake.ts";
import { type AppStateHandle, createAppState } from "./state.ts";

const NOW = "2026-10-06T12:00:00.000Z";

const setup = async (
  seed: readonly Event[] = [],
): Promise<{ readonly state: AppStateHandle; readonly store: ReturnType<typeof createMemoryEventStore> }> => {
  const store = createMemoryEventStore();
  await store.append(seed);
  await store.markSynced(seed.map((event) => event.id));
  const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
  await state.ready;
  return { state, store };
};

const languageInput = (occurredAt: string, language: "en" | "ru") =>
  ({ occurredAt, payload: { language }, type: "settings.updated" }) as const;

describe("createAppState loading", () => {
  it("starts loading, then materializes what the store holds", async () => {
    const store = createMemoryEventStore();
    await store.append([settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" })]);
    const state = createAppState({ deviceId: "dev-1", now: () => NOW, source: "web", store });
    expect(state.store.getState().status).toBe("loading");
    await state.ready;
    expect(state.store.getState()).toMatchObject({
      deviceId: "dev-1",
      lastAppliedOccurredAt: at(9),
      settings: { ...DEFAULT_SETTINGS, language: "ru" },
      status: "ready",
    });
  });
});

describe("createAppState dispatch", () => {
  it("fills the envelope, validates, persists and applies the event", async () => {
    const { state, store } = await setup();
    const result = await state.dispatch(languageInput(at(10), "ru"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(isUlid(result.value.id)).toBe(true);
    expect(result.value).toMatchObject({
      deviceId: "dev-1",
      precision: "exact",
      recordedAt: NOW,
      source: "web",
    });
    await expect(store.listPending()).resolves.toEqual([result.value]);
    expect(state.store.getState()).toMatchObject({
      events: [result.value],
      lastAppliedOccurredAt: at(10),
      settings: { ...DEFAULT_SETTINGS, language: "ru" },
      version: 2,
    });
  });

  it("rejects an invalid event without persisting it", async () => {
    const { state, store } = await setup();
    const result = await state.dispatch({
      occurredAt: "not-a-date",
      payload: { language: "ru" },
      type: "settings.updated",
    });
    expect(result).toMatchObject({ ok: false });
    await expect(store.listAll()).resolves.toEqual([]);
  });

  it("re-materializes when a retro event arrives", async () => {
    const { state } = await setup();
    await state.dispatch(languageInput(at(10), "ru"));
    const retro = await state.dispatch({ ...languageInput(at(9), "en"), timezone: "UTC" });
    expect(retro.ok).toBe(true);
    const snapshot = state.store.getState();
    expect(snapshot.settings.language).toBe("ru");
    expect(snapshot.lastAppliedOccurredAt).toBe(at(10));
    expect(snapshot.events.map((event) => event.occurredAt)).toEqual([at(9), at(10)]);
  });
});

describe("createAppState corrections", () => {
  it("revoke restores the previous settings", async () => {
    const { state } = await setup();
    const first = await state.dispatch(languageInput(at(10), "ru"));
    if (!first.ok) {
      throw new Error(first.error);
    }
    const revoked = await state.revoke(first.value.id);
    expect(revoked.ok).toBe(true);
    expect(state.store.getState().settings.language).toBe("en");
    expect(state.store.getState().events).toEqual([]);
  });

  it("revoke of an unknown event fails", async () => {
    const { state } = await setup();
    await expect(state.revoke("missing")).resolves.toEqual({
      error: "event/not-found",
      ok: false,
    });
  });

  it("undoLast revokes the latest event made by this device", async () => {
    const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(11), { timezone: "UTC" });
    const { state } = await setup([remote]);
    await state.dispatch(languageInput(at(10), "ru"));
    const undone = await state.undoLast();
    expect(undone.ok).toBe(true);
    expect(state.store.getState().settings).toEqual({ ...DEFAULT_SETTINGS, timezone: "UTC" });
    await expect(state.undoLast()).resolves.toEqual({ error: "undo/nothing", ok: false });
  });
});

describe("createAppState ingest", () => {
  it("skips known ids, persists remote events as synced and applies them", async () => {
    const { state, store } = await setup();
    const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(10), { language: "ru" });
    await state.ingest([remote, remote]);
    await state.ingest([remote]);
    await expect(store.listAll()).resolves.toEqual([remote]);
    await expect(store.listPending()).resolves.toEqual([]);
    expect(state.store.getState().settings.language).toBe("ru");
    expect(state.store.getState().version).toBe(2);
  });

  it("re-materializes when a remote event is older than the last applied one", async () => {
    const { state } = await setup();
    await state.dispatch(languageInput(at(10), "ru"));
    await state.ingest([settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "en" })]);
    expect(state.store.getState().settings.language).toBe("ru");
    expect(state.store.getState().events).toHaveLength(2);
  });

  it("rematerialize reloads from the store", async () => {
    const { state, store } = await setup();
    await store.append([settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(10), { language: "ru" })]);
    await state.rematerialize();
    expect(state.store.getState().settings.language).toBe("ru");
  });

  it("yields the same state whatever the ingestion order", async () => {
    const events = [
      settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { language: "ru" }),
      settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAB", at(10), { timezone: "UTC" }),
      settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAC", at(10), { language: "en" }),
      settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAD", at(8), { timezone: "Europe/Moscow" }),
    ];
    const reference = (await setup(events)).state.store.getState();
    await fc.assert(
      fc.asyncProperty(fc.shuffledSubarray(events, { minLength: 4 }), async (shuffled) => {
        const { state } = await setup();
        for (const event of shuffled) {
          await state.ingest([event]);
        }
        const actual = state.store.getState();
        expect(actual.settings).toEqual(reference.settings);
        expect(actual.events).toEqual(reference.events);
        expect(actual.lastAppliedOccurredAt).toBe(reference.lastAppliedOccurredAt);
      }),
    );
  });
});
