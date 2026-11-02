import { createStore } from "zustand/vanilla";

import { shownThenSaved } from "./shown-then-saved.ts";

const picker = () =>
  createStore<{ choice: string; other: number }>(() => ({ choice: "a", other: 1 }));

describe("shownThenSaved", () => {
  it("shows the change before the save settles, and keeps it once saved", async () => {
    const store = picker();
    const saving = Promise.withResolvers<undefined>();
    const done = shownThenSaved(store, { choice: "b" }, async () => {
      await saving.promise;
    });
    expect(store.getState()).toEqual({ choice: "b", other: 1 });
    saving.resolve(undefined);
    await done;
    expect(store.getState()).toEqual({ choice: "b", other: 1 });
  });

  it("puts the previous value back when the save is refused", async () => {
    const store = picker();
    const done = shownThenSaved(store, { choice: "b" }, async () => {
      await Promise.reject(new Error("refused"));
    });
    await expect(done).rejects.toThrow("refused");
    expect(store.getState()).toEqual({ choice: "a", other: 1 });
  });

  it("leaves a later pick alone when an earlier pick's save is refused", async () => {
    const store = picker();
    const first = Promise.withResolvers<undefined>();
    const earlier = shownThenSaved(store, { choice: "b" }, async () => {
      await first.promise;
    });
    await shownThenSaved(store, { choice: "c" }, async () => {
      await Promise.resolve();
    });
    first.reject(new Error("refused"));
    await expect(earlier).rejects.toThrow("refused");
    expect(store.getState()).toEqual({ choice: "c", other: 1 });
  });
});
