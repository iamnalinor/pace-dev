import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, type Event, isUlid } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { at, settingsEvent } from "./fake-fetch.fake.ts";
import { createHeldEventStore } from "./held-event-store.fake.ts";
import { type AppStateHandle, createAppState } from "./state.ts";

const NOW = "2026-10-06T12:00:00.000Z";

const setup = async (
  seed: readonly Event[] = [],
): Promise<{
  readonly state: AppStateHandle;
  readonly store: ReturnType<typeof createMemoryEventStore>;
}> => {
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
    const retro = await state.dispatch(languageInput(at(9), "en"));
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

describe("createAppState slices", () => {
  it("materializes tasks, projects and presets with the core reducers", async () => {
    const { state } = await setup();
    await state.dispatch({
      occurredAt: at(9),
      payload: { projectId: "p1", name: "Algebra", color: "blue" },
      type: "project.created",
    });
    await state.dispatch({
      occurredAt: at(10),
      payload: {
        taskId: "t1",
        title: "Sheet 1",
        presetId: "hw",
        projectId: "p1",
        subtasks: [],
        fields: {},
      },
      type: "task.created",
    });
    const snapshot = state.store.getState();
    expect(snapshot.projects.byId["p1"]).toMatchObject({ name: "Algebra", color: "blue" });
    expect(snapshot.tasks.byId["t1"]).toMatchObject({ title: "Sheet 1", projectId: "p1" });
    expect(snapshot.presets.byId["hw"]?.builtIn).toBe(true);
  });

  it("keeps the raw log, corrections included, next to the effective events", async () => {
    const { state } = await setup();
    const first = await state.dispatch(languageInput(at(10), "ru"));
    if (!first.ok) {
      throw new Error(first.error);
    }
    const revoked = await state.revoke(first.value.id);
    if (!revoked.ok) {
      throw new Error(revoked.error);
    }
    const snapshot = state.store.getState();
    expect(snapshot.events).toEqual([]);
    expect(snapshot.log.map((event) => event.id)).toEqual([first.value.id, revoked.value.id]);
    await state.rematerialize();
    expect(state.store.getState().log).toHaveLength(2);
  });
});

/** Lets every queued microtask and timer of the log run (the held write stays held). */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const heldSetup = async (): Promise<{
  readonly state: AppStateHandle;
  readonly held: ReturnType<typeof createHeldEventStore>;
  readonly locals: () => number;
}> => {
  const held = createHeldEventStore();
  let locals = 0;
  const state = createAppState({
    deviceId: "dev-1",
    now: () => NOW,
    onLocal: () => {
      locals += 1;
    },
    source: "web",
    store: held.store,
  });
  await state.ready;
  held.hold();
  return { held, locals: () => locals, state };
};

/** A settled-or-not marker for a promise the test does not await yet. */
const track = <T>(
  promise: Promise<T>,
): { readonly isSettled: () => boolean; readonly value: () => T | undefined } => {
  let isSettled = false;
  let value: T | undefined;
  void (async () => {
    value = await promise;
    isSettled = true;
  })();
  return { isSettled: () => isSettled, value: () => value };
};

/** Russian at 10:00, then the zone set to UTC at 11:00: two independent settings. */
const RU_AT_10 = languageInput(at(10), "ru");
const UTC_AT_11 = {
  occurredAt: at(11),
  payload: { timezone: "UTC" },
  type: "settings.updated",
} as const;

describe("createAppState local writes (the screen first, the disk after)", () => {
  it("shows a dispatched event before its local write lands, then answers once it does", async () => {
    const { held, locals, state } = await heldSetup();
    const before = state.store.getState().version;
    const answer = track(state.dispatch(RU_AT_10));
    await flush();

    // Pending: the state shows it, the write is in flight, nobody is told it is saved.
    expect(held.writes).toHaveLength(1);
    expect(state.store.getState().version).toBeGreaterThan(before);
    expect(state.store.getState().settings.language).toBe("ru");
    expect(answer.value()).toBeUndefined();
    expect(locals()).toBe(0);
    await expect(held.store.listPending()).resolves.toEqual([]);

    // Resolved: the action answers ok, the outbox holds it, the sync is told.
    await held.writes[0]?.resolve();
    await flush();
    expect(answer.value()).toMatchObject({ ok: true, value: { type: "settings.updated" } });
    await expect(held.store.listPending()).resolves.toHaveLength(1);
    expect(locals()).toBe(1);
    expect(state.store.getState().settings.language).toBe("ru");
  });

  it("takes the event back and answers persist_failed when the local write is refused", async () => {
    const { held, locals, state } = await heldSetup();
    const before = state.store.getState();
    const answer = track(state.dispatch(RU_AT_10));
    await flush();
    expect(state.store.getState().settings.language).toBe("ru");

    held.writes[0]?.reject();
    await flush();
    expect(answer.value()).toEqual({ error: "persist_failed", ok: false });
    const after = state.store.getState();
    expect(after.version).toBeGreaterThan(before.version);
    expect(after.settings).toEqual(before.settings);
    expect(after.events).toEqual(before.events);
    expect(after.log).toEqual(before.log);
    expect(after.lastAppliedOccurredAt).toBe(before.lastAppliedOccurredAt);
    expect(locals()).toBe(0);
    await expect(held.store.listAll()).resolves.toEqual([]);
    // The log forgot it too: it cannot be revoked, and the same id may be written again.
    const id = held.writes[0]?.events[0]?.id ?? "";
    await expect(state.revoke(id)).resolves.toEqual({ error: "event/not-found", ok: false });
  });

  it("keeps a second quick action, in order, when only the first one's write is refused", async () => {
    const { held, state } = await heldSetup();
    const first = track(state.dispatch(RU_AT_10));
    const second = track(state.dispatch(UTC_AT_11));
    await flush();

    // The second shows while the first is still on its way to the disk.
    expect(state.store.getState().settings).toMatchObject({ language: "ru", timezone: "UTC" });
    // Writes stay in the order of the actions: the second waits for the first to settle.
    expect(held.writes).toHaveLength(1);

    held.writes[0]?.reject();
    await flush();
    expect(held.writes).toHaveLength(2);
    expect(state.store.getState().settings).toMatchObject({ language: "en", timezone: "UTC" });
    await held.writes[1]?.resolve();
    await flush();

    expect(first.value()).toEqual({ error: "persist_failed", ok: false });
    expect(second.value()).toMatchObject({ ok: true });
    expect(state.store.getState().settings).toEqual({ ...DEFAULT_SETTINGS, timezone: "UTC" });
    expect(state.store.getState().events.map((event) => event.occurredAt)).toEqual([at(11)]);
    const stored = await held.store.listAll();
    expect(stored.map((event) => event.occurredAt)).toEqual([at(11)]);
  });

  it("keeps remote events that arrive while a refused local write was in flight", async () => {
    const { held, state } = await heldSetup();
    const local = track(state.dispatch(RU_AT_10));
    await flush();
    const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { timezone: "UTC" });
    const ingested = track(state.ingest([remote]));
    await flush();
    // Both show while the local write is still on its way.
    expect(state.store.getState().settings).toMatchObject({ language: "ru", timezone: "UTC" });
    expect(ingested.isSettled()).toBe(false);

    held.writes[0]?.reject();
    await flush();
    await held.writes[1]?.resolve();
    await flush();

    expect(local.value()).toEqual({ error: "persist_failed", ok: false });
    expect(ingested.isSettled()).toBe(true);
    expect(state.store.getState().settings).toEqual({ ...DEFAULT_SETTINGS, timezone: "UTC" });
    expect(state.store.getState().events).toEqual([remote]);
    await expect(held.store.listAll()).resolves.toEqual([remote]);
    await expect(held.store.listPending()).resolves.toEqual([]);
  });

  it("keeps the server's copy of a deterministic id whose local write is refused", async () => {
    const { held, state } = await heldSetup();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAA";
    const local = track(state.dispatch({ ...RU_AT_10, id }));
    await flush();
    const remote = settingsEvent(id, at(10), { language: "ru" });
    const ingested = track(state.ingest([remote]));
    await flush();
    expect(state.store.getState().events).toHaveLength(1);

    held.writes[0]?.reject();
    await flush();
    await held.writes[1]?.resolve();
    await flush();

    expect(local.value()).toEqual({ error: "persist_failed", ok: false });
    expect(ingested.isSettled()).toBe(true);
    expect(state.store.getState().settings.language).toBe("ru");
    expect(state.store.getState().events.map((event) => event.id)).toEqual([id]);
    await expect(held.store.listAll()).resolves.toEqual([remote]);
    await expect(held.store.listPending()).resolves.toEqual([]);
  });

  it("keeps an adopted id on screen when the server's write is refused but its own local write landed", async () => {
    const { held, state } = await heldSetup();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAA";
    const local = track(state.dispatch({ ...RU_AT_10, id }));
    await flush();
    const ingested = state.ingest([settingsEvent(id, at(10), { language: "ru" })]);
    await flush();
    await held.writes[0]?.resolve();
    await flush();
    held.writes[1]?.reject();
    await expect(ingested).rejects.toThrow("persist_failed");
    expect(local.value()).toMatchObject({ ok: true });
    // On the disk through its own write: it stays, on screen and in the log.
    expect(state.store.getState().events.map((event) => event.id)).toEqual([id]);
    expect(state.store.getState().settings.language).toBe("ru");
  });

  it("shows the server's copy of an id whose local write is still in flight", async () => {
    const { held, state } = await heldSetup();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAA";
    void state.dispatch({ ...RU_AT_10, id });
    await flush();
    const copy = settingsEvent(id, at(10), { language: "en" });
    void state.ingest([copy]);
    await flush();
    expect(state.store.getState().settings.language).toBe("en");
    expect(state.store.getState().log).toEqual([copy]);
    await held.writes[0]?.resolve();
    await flush();
    await held.writes[1]?.resolve();
    await flush();
    expect(state.store.getState().log).toEqual([copy]);
  });

  it("takes remote events back and rejects the ingest when the local store refuses them", async () => {
    const { held, state } = await heldSetup();
    const remote = settingsEvent("01ARZ3NDEKTSV4RRFFQ69G5FAA", at(9), { timezone: "UTC" });
    const ingested = state.ingest([remote]);
    await flush();
    expect(state.store.getState().settings.timezone).toBe("UTC");
    held.writes[0]?.reject();
    await expect(ingested).rejects.toThrow("persist_failed");
    expect(state.store.getState().settings).toEqual(DEFAULT_SETTINGS);
    // Not kept, so the next pull (the cursor did not move) brings it in again.
    held.release();
    await state.ingest([remote]);
    expect(state.store.getState().settings.timezone).toBe("UTC");
  });

  it("writes a multi-event batch in one append and takes all of it back when refused", async () => {
    const { held, state } = await heldSetup();
    const staged = await state.stage([RU_AT_10, UTC_AT_11]);
    if (!staged.ok) {
      throw new Error(staged.error);
    }
    expect(state.store.getState().settings).toMatchObject({ language: "ru", timezone: "UTC" });
    expect(held.writes.map((write) => write.events.length)).toEqual([2]);
    held.writes[0]?.reject();
    await expect(staged.value.persisted).resolves.toEqual({ error: "persist_failed", ok: false });
    expect(state.store.getState().settings).toEqual(DEFAULT_SETTINGS);
    expect(state.store.getState().events).toEqual([]);
  });

  it("refuses a whole batch, writing nothing, when one input is invalid", async () => {
    const { held, state } = await heldSetup();
    const staged = await state.stage([
      languageInput(at(10), "ru"),
      { occurredAt: "not-a-date", payload: { language: "en" }, type: "settings.updated" },
    ]);
    expect(staged.ok).toBe(false);
    expect(held.writes).toEqual([]);
    expect(state.store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it("clears through the write queue: a write queued behind one in flight never lands in the wiped store", async () => {
    const { held, locals, state } = await heldSetup();
    const first = track(state.dispatch(RU_AT_10));
    const second = track(state.dispatch(UTC_AT_11));
    await flush();
    expect(held.writes).toHaveLength(1);
    const cleared = track(state.clear());
    await flush();
    // Gone from the screen at once (signing out), whatever the disk still does.
    expect(state.store.getState().settings).toEqual(DEFAULT_SETTINGS);
    await held.writes[0]?.resolve();
    await flush();
    expect(cleared.isSettled()).toBe(true);
    expect(held.writes).toHaveLength(1);
    expect(second.value()).toEqual({ error: "persist_failed", ok: false });
    expect(first.value()).toMatchObject({ ok: true });
    await expect(held.store.listAll()).resolves.toEqual([]);
    await expect(held.store.listPending()).resolves.toEqual([]);
    expect(state.store.getState().events).toEqual([]);
    expect(locals()).toBe(1);
    // A fresh write after the clear lands as usual.
    held.release();
    await expect(state.dispatch(RU_AT_10)).resolves.toMatchObject({ ok: true });
    await expect(held.store.listPending()).resolves.toHaveLength(1);
  });

  it("a reload waits for writes in flight, so it never drops an event the state shows", async () => {
    const { held, state } = await heldSetup();
    const local = track(state.dispatch(RU_AT_10));
    await flush();
    const reloaded = track(state.rematerialize());
    await flush();
    expect(reloaded.isSettled()).toBe(false);
    await held.writes[0]?.resolve();
    await flush();
    expect(reloaded.isSettled()).toBe(true);
    expect(local.value()).toMatchObject({ ok: true });
    expect(state.store.getState().settings.language).toBe("ru");
  });
});
