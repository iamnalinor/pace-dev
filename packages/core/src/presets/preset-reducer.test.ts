import { describe, expect, it } from "vitest";

import type { Event, EventInput } from "../events/event-schema.ts";

import { materialize } from "../materialize/materializer.ts";
import { BASE_PRESETS } from "./base-presets.ts";
import { exampleCoursePresetEvents } from "./example-presets.ts";
import { INITIAL_PRESETS_STATE, presetReducer, type PresetsState } from "./preset-reducer.ts";

const at = (hour: number): string => `2026-10-06T${String(hour).padStart(2, "0")}:00:00.000Z`;

const stamp = (index: number): string =>
  `01ARZ3NDEKTSV4RRFFQ69G5F${String(index).padStart(2, "0")}`;

const event = (index: number, input: EventInput): Event => ({
  ...input,
  deviceId: "d",
  id: stamp(index),
  recordedAt: input.occurredAt,
});

const created = (
  index: number,
  payload: { readonly id: string; readonly extends?: string; readonly definition: unknown },
): Event =>
  event(index, {
    occurredAt: at(index),
    payload: { name: payload.id, ...payload, definition: payload.definition as never },
    precision: "exact",
    source: "web",
    type: "preset.created",
  });

const updated = (
  index: number,
  payload: {
    readonly id: string;
    readonly name?: string;
    readonly extends?: null | string;
    readonly definition?: unknown;
    readonly order?: number;
  },
): Event =>
  event(index, {
    occurredAt: at(index),
    payload: { ...payload, definition: payload.definition as never },
    precision: "exact",
    source: "web",
    type: "preset.updated",
  });

const archived = (index: number, id: string): Event =>
  event(index, {
    occurredAt: at(index),
    payload: { id },
    precision: "exact",
    source: "web",
    type: "preset.archived",
  });

const fold = (events: readonly Event[]): PresetsState =>
  materialize(events, presetReducer, INITIAL_PRESETS_STATE);

describe("INITIAL_PRESETS_STATE", () => {
  it("holds the base presets and nothing else", () => {
    expect(INITIAL_PRESETS_STATE.byId).toEqual(BASE_PRESETS);
  });
});

describe("presetReducer: preset.created", () => {
  it("adds a user preset with the event's occurredAt as createdAt", () => {
    const state = fold([
      created(1, { definition: { defaultImportance: "asap" }, extends: "hw", id: "hw.algebra" }),
    ]);
    expect(state.byId["hw.algebra"]).toEqual({
      archived: false,
      builtIn: false,
      createdAt: at(1),
      definition: { defaultImportance: "asap" },
      extends: "hw",
      id: "hw.algebra",
      name: "hw.algebra",
      order: 100,
    });
  });

  it("stores a missing extends as null (resolve reports it later)", () => {
    const state = fold([created(1, { definition: {}, id: "orphan" })]);
    expect(state.byId["orphan"]?.extends).toBeNull();
  });

  it("stores an unknown parent as given", () => {
    const state = fold([created(1, { definition: {}, extends: "ghost", id: "child" })]);
    expect(state.byId["child"]?.extends).toBe("ghost");
  });

  it("ignores a second creation of the same id", () => {
    const first = created(1, { definition: { color: "teal" }, extends: "hw", id: "hw.algebra" });
    const again = created(2, { definition: { color: "pink" }, extends: "work", id: "hw.algebra" });
    const once = fold([first]);
    expect(presetReducer(once, again)).toBe(once);
  });

  it("never creates a preset with a built-in id", () => {
    const state = fold([created(1, { definition: { color: "teal" }, extends: "work", id: "hw" })]);
    expect(state).toBe(INITIAL_PRESETS_STATE);
  });

  it("ignores a definition that fails the schema", () => {
    const state = fold([
      created(1, { definition: { urgencyPolicy: "panic" }, extends: "hw", id: "hw.algebra" }),
      created(2, { definition: { display: "card" }, extends: "hw", id: "hw.other" }),
    ]);
    expect(state).toBe(INITIAL_PRESETS_STATE);
  });

  it("ignores an id that is not a slug", () => {
    const state = fold([created(1, { definition: {}, extends: "hw", id: "HW Algebra" })]);
    expect(state).toBe(INITIAL_PRESETS_STATE);
  });

  it("drops unknown keys only when the schema would: the stored definition is the parsed one", () => {
    const state = fold([
      created(1, { definition: { fields: { link: true } }, extends: "work", id: "w.1" }),
    ]);
    expect(state.byId["w.1"]?.definition).toEqual({ fields: { link: true } });
  });
});

describe("presetReducer: preset.updated", () => {
  const base = created(1, { definition: { color: "teal" }, extends: "hw", id: "hw.algebra" });

  it("patches the name", () => {
    const state = fold([base, updated(2, { id: "hw.algebra", name: "Algebra" })]);
    expect(state.byId["hw.algebra"]).toMatchObject({
      definition: { color: "teal" },
      extends: "hw",
      name: "Algebra",
    });
  });

  it("patches extends, including to null", () => {
    expect(
      fold([base, updated(2, { extends: "work", id: "hw.algebra" })]).byId["hw.algebra"],
    ).toMatchObject({ extends: "work" });
    expect(
      fold([base, updated(2, { extends: null, id: "hw.algebra" })]).byId["hw.algebra"],
    ).toMatchObject({ extends: null });
  });

  it("replaces the whole definition", () => {
    const state = fold([
      base,
      updated(2, { definition: { submission: "whole" }, id: "hw.algebra" }),
    ]);
    expect(state.byId["hw.algebra"]?.definition).toEqual({ submission: "whole" });
  });

  it("keeps createdAt, archived and builtIn", () => {
    const state = fold([
      base,
      archived(2, "hw.algebra"),
      updated(3, { id: "hw.algebra", name: "Algebra" }),
    ]);
    expect(state.byId["hw.algebra"]).toMatchObject({
      archived: true,
      builtIn: false,
      createdAt: at(1),
    });
  });

  it("edits a default preset: name, color and any field, but never its parent", () => {
    const state = fold([
      updated(1, { definition: { color: "pink" }, extends: "work", id: "hw", name: "Homework+" }),
    ]);
    expect(state.byId["hw"]).toMatchObject({
      builtIn: true,
      definition: { color: "pink" },
      extends: null,
      name: "Homework+",
    });
  });

  it("ignores an update to an unknown preset", () => {
    expect(fold([updated(1, { id: "ghost", name: "Ghost" })])).toBe(INITIAL_PRESETS_STATE);
  });

  it("ignores the whole event when the new definition fails the schema", () => {
    const once = fold([base]);
    const bad = updated(2, { definition: { color: "red" }, id: "hw.algebra", name: "Algebra" });
    expect(presetReducer(once, bad)).toBe(once);
  });

  it("returns the same state when the patch changes nothing", () => {
    const once = fold([base]);
    expect(presetReducer(once, updated(2, { id: "hw.algebra" }))).toBe(once);
    expect(
      presetReducer(once, updated(2, { extends: "hw", id: "hw.algebra", name: "hw.algebra" })),
    ).toBe(once);
  });
});

describe("presetReducer: preset.archived", () => {
  const base = created(1, { definition: {}, extends: "hw", id: "hw.algebra" });

  it("archives a user preset", () => {
    expect(fold([base, archived(2, "hw.algebra")]).byId["hw.algebra"]?.archived).toBe(true);
  });

  it("archives a default preset too, except the inbox", () => {
    expect(fold([archived(1, "deferred")]).byId["deferred"]?.archived).toBe(true);
    expect(fold([archived(1, "inbox")])).toBe(INITIAL_PRESETS_STATE);
  });

  it("is a no-op on an archived or unknown preset", () => {
    const once = fold([base, archived(2, "hw.algebra")]);
    expect(presetReducer(once, archived(3, "hw.algebra"))).toBe(once);
    expect(presetReducer(once, archived(3, "ghost"))).toBe(once);
  });
});

describe("presetReducer: other events", () => {
  it("leaves the state untouched", () => {
    const other = event(1, {
      occurredAt: at(1),
      payload: { taskId: "t" },
      precision: "exact",
      source: "app",
      type: "task.reopened",
    });
    expect(presetReducer(INITIAL_PRESETS_STATE, other)).toBe(INITIAL_PRESETS_STATE);
  });
});

const seed = (offset: number): readonly Event[] =>
  exampleCoursePresetEvents(at(offset)).map((input, index) => event(offset + index, input));

describe("example seed", () => {
  it("applied twice yields one preset per example, created by the first seed", () => {
    const state = fold([...seed(1), ...seed(5)]);
    const examples = Object.values(state.byId).filter((preset) => !preset.builtIn);
    expect(examples.map((preset) => preset.id).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "hw.algebra",
      "hw.calculus",
      "hw.history",
    ]);
    expect(examples.every((preset) => preset.createdAt === at(1))).toBe(true);
  });
});

describe("presetReducer: order", () => {
  it("lists the defaults Homework, Work, Personal, Deferred, and new presets after them", () => {
    const state = fold([created(1, { definition: {}, extends: "hw", id: "hw.algebra" })]);
    const order = Object.values(state.byId)
      .toSorted((a, b) => a.order - b.order)
      .map((preset) => preset.id);
    expect(order).toEqual(["hw", "work", "personal", "deferred", "inbox", "hw.algebra"]);
  });

  it("takes a new order from an update", () => {
    expect(fold([updated(1, { id: "deferred", order: 0 })]).byId["deferred"]?.order).toBe(0);
  });
});
