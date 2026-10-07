import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../model/settings.ts";
import { INITIAL_PRESETS_STATE } from "../presets/preset-reducer.ts";
import { coreReducer, INITIAL_CORE_STATE } from "./core-state.ts";
import { materialize } from "./materializer.ts";
import { at, hwCreated } from "./task-fixture.fake.ts";

const T0 = "2026-10-05T07:00:00.000Z";

describe("coreReducer", () => {
  it("starts from the initial slices", () => {
    expect(INITIAL_CORE_STATE.tasks.byId).toEqual({});
    expect(INITIAL_CORE_STATE.projects.byId).toEqual({});
    expect(INITIAL_CORE_STATE.presets).toBe(INITIAL_PRESETS_STATE);
    expect(INITIAL_CORE_STATE.settings).toBe(DEFAULT_SETTINGS);
  });

  it("folds every slice from one log", () => {
    const state = materialize(
      [
        at(1, T0, {
          type: "settings.updated",
          payload: { timezone: "Europe/Moscow" },
          source: "web",
        }),
        at(2, T0, {
          type: "project.created",
          payload: { projectId: "p-algebra", name: "Algebra", color: "blue" },
        }),
        at(3, T0, {
          type: "preset.created",
          payload: { id: "hw.algebra", name: "Algebra HW", extends: "hw", definition: {} },
          source: "web",
        }),
        hwCreated(4),
      ],
      coreReducer,
      INITIAL_CORE_STATE,
    );
    expect(state.settings.timezone).toBe("Europe/Moscow");
    expect(state.projects.byId["p-algebra"]?.name).toBe("Algebra");
    expect(state.presets.byId["hw.algebra"]?.extends).toBe("hw");
    expect(state.tasks.byId["hw:hw.algebra:2026-W41"]?.title).toBe("Algebra HW 6");
  });

  it("keeps the state reference when no slice changed", () => {
    const state = coreReducer(INITIAL_CORE_STATE, hwCreated(1));
    const untouched = coreReducer(state, hwCreated(1));
    expect(untouched).toBe(state);
  });

  it("keeps the references of the untouched slices", () => {
    const state = coreReducer(INITIAL_CORE_STATE, hwCreated(1));
    const next = coreReducer(
      state,
      at(2, T0, { type: "settings.updated", payload: { language: "ru" }, source: "web" }),
    );
    expect(next).not.toBe(state);
    expect(next.tasks).toBe(state.tasks);
    expect(next.projects).toBe(state.projects);
    expect(next.presets).toBe(state.presets);
    expect(next.settings.language).toBe("ru");
  });
});
