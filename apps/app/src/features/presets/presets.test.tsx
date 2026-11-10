import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { PresetScreen } from "#app/features/presets/preset-screen.tsx";
import { isControl } from "#app/test/focus-target.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { navigatorState, router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import { PresetsList } from "./presets-list.tsx";

/** Where focus went and what was said, as a confirm asked the platform (bug class 5). */
const mockMoveFocus = jest.fn<undefined, [unknown, string | undefined]>();
jest.mock("#app/platform/move-focus.ts", (): unknown => ({
  moveFocus: (target: unknown, say?: string) => {
    mockMoveFocus(target, say);
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

/** The preset named "Linear Algebra", whatever its id. */
const linearAlgebra = (runtime: PaceRuntime) =>
  Object.values(runtime.state.store.getState().presets.byId).find(
    (preset) => preset.name === "Linear Algebra",
  );

const unwrapOk = (result: { readonly ok: boolean }): void => {
  expect(result.ok).toBe(true);
};

const presetOf = (runtime: PaceRuntime, id: string) =>
  runtime.state.store.getState().presets.byId[id];

describe("PresetsList", () => {
  it("says each row's «Default» or «Yours» to a screen reader too, not the name alone (bug class 141 sweep)", async () => {
    await renderScreen(<PresetsList />, await createTestRuntime({ world: "empty" }));
    expect(screen.getByRole("link", { name: "Work, Default" })).toBeOnTheScreen();
  });

  it("says «Default» under the name, not beside it, so the reorder arrows never cut the name (design review H3)", async () => {
    await renderScreen(<PresetsList />, await createTestRuntime({ world: "empty" }));
    // The kind sits in the title's own column (the row's subtitle), not in the trailing slot.
    const work = screen.getByText("Work");
    const kind = screen.getAllByText("Default").find((node) => node.parent === work.parent);
    expect(kind).toBeDefined();
  });

  it("draws one chevron per row, the one that opens it: the reorder buttons are arrows (QA round 24 R24-10)", async () => {
    await renderScreen(<PresetsList />, await createTestRuntime({ world: "empty" }));
    type Node = { readonly props: Record<string, unknown>; readonly children: readonly unknown[] };
    const icons = (node: Node): readonly string[] => {
      const own = node.props["className"];
      const nested = node.children.flatMap((child) =>
        typeof child === "object" && child !== null ? icons(child as Node) : [],
      );
      return typeof own === "string" && own.startsWith("lucide ") ? [own, ...nested] : nested;
    };
    const up = screen.getByRole("button", { name: en("presets.moveUp", { name: "Work" }) });
    const down = screen.getByRole("button", { name: en("presets.moveDown", { name: "Work" }) });
    expect(icons(up as unknown as Node).join(" ")).not.toMatch(/chevron/u);
    expect(icons(down as unknown as Node).join(" ")).not.toMatch(/chevron/u);
    const open = screen.getByRole("link", { name: /^Work/u }) as unknown as Node;
    expect(icons(open).join(" ")).toMatch(/chevron-right/u);
  });

  it("lists deleted presets last, without reorder arrows, once they are shown (QA round 25 R25-02)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.actions.archivePreset("work");
    await renderScreen(<PresetsList />, runtime);
    expect(screen.queryByRole("link", { name: /^Work/u })).toBeNull();
    await fireEvent.press(screen.getByRole("switch", { name: en("presets.showArchived") }));
    expect(screen.getAllByRole("link").at(-1)).toHaveAccessibleName(
      `Work, ${en("presets.archivedBadge")} · Default`,
    );
    expect(
      screen.queryByRole("button", { name: en("presets.moveUp", { name: "Work" }) }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: en("presets.moveDown", { name: "Work" }) }),
    ).toBeNull();
  });

  it("lists the defaults in picker order, opens one and moves one", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetsList />, runtime);
    await fireEvent.press(screen.getByRole("link", { name: /^Work/u }));
    expect(router.push).toHaveBeenCalledWith({ params: { id: "work" }, pathname: "/presets/[id]" });
    expect(
      screen.getByRole("button", { name: en("presets.moveUp", { name: "Homework" }) }),
    ).toBeDisabled();
    await fireEvent.press(
      screen.getByRole("button", { name: en("presets.moveUp", { name: "Personal" }) }),
    );
    await waitFor(() => {
      expect(presetOf(runtime, "personal")?.order).toBe(2);
    });
  });

  it("opens a new preset from the parent picked, with no extra button, and seeds the examples once", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetsList />, runtime);
    expect(screen.queryByRole("button", { name: en("presets.new") })).toBeNull();
    // "Start from" lists actions, not a choice: buttons, none of them drawn as picked (QA 19 L7).
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    await fireEvent.press(
      screen.getByRole("button", { name: en("presets.startFromName", { name: "Work" }) }),
    );
    expect(router.push).toHaveBeenCalledWith({
      params: { from: "work", id: "new" },
      pathname: "/presets/[id]",
    });
    await fireEvent.press(screen.getByRole("button", { name: en("presets.seedExamples") }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: en("presets.seedExamples") })).toBeNull();
    });
  });
});

describe("PresetScreen", () => {
  it("edits a default preset against its shipped values", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetScreen from={undefined} id="work" />, runtime);
    expect(screen.getAllByText(en("presets.inheritedDefault")).length).toBeGreaterThan(0);
    const colorField = en("presets.field.color");
    const override = screen.getByRole("switch", {
      name: en("presets.override", { field: colorField }),
    });
    await fireEvent.press(override);
    await fireEvent.press(screen.getByRole("radio", { name: en("color.coral") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(presetOf(runtime, "work")?.definition).toEqual({ color: "coral" });
    });
    expect(router.back).toHaveBeenCalled();
  });

  it("saves a time still being typed when Save is tapped without leaving the field (review I1)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetScreen from={undefined} id="work" />, runtime);
    const field = en("presets.field.recurrence");
    await fireEvent.press(screen.getByRole("switch", { name: en("presets.override", { field }) }));
    await fireEvent.press(screen.getByRole("switch", { name: en("presets.repeats") }));
    // On Android the tap on Save blurs nothing: the field never hears that it was left.
    await fireEvent.changeText(screen.getByLabelText(en("presets.issuedAt")), "1115");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(presetOf(runtime, "work")?.definition.recurrence?.issued.time).toBe("11:15");
    });
  });

  it("refuses Save while a typed time cannot be read, and says so under the field (R27-02)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    const before = presetOf(runtime, "work")?.definition;
    await renderScreen(<PresetScreen from={undefined} id="work" />, runtime);
    const field = en("presets.field.recurrence");
    await fireEvent.press(screen.getByRole("switch", { name: en("presets.override", { field }) }));
    await fireEvent.press(screen.getByRole("switch", { name: en("presets.repeats") }));
    await fireEvent.changeText(screen.getByLabelText(en("presets.issuedAt")), "2500");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    expect(screen.getByRole("alert")).toHaveTextContent(en("day.badTime"));
    expect(router.back).not.toHaveBeenCalled();
    expect(presetOf(runtime, "work")?.definition).toEqual(before);
  });

  it("keeps focus through the delete confirmation: onto Cancel, saying the question, and back (bug class 5)", async () => {
    await renderScreen(
      <PresetScreen from={undefined} id="deferred" />,
      await createTestRuntime({ world: "empty" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: en("presets.archive") }));
    const [toCancel, said] = mockMoveFocus.mock.calls[0] ?? [];
    const toCancelControl = screen.getByRole("button", { name: en("common.cancel") });
    expect(isControl(toCancel, toCancelControl)).toBe(true);
    expect(said).toMatch(/Delete/u);
    expect(screen.getByText(said ?? "").props).toMatchObject({ role: "status" });
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    const [back] = mockMoveFocus.mock.calls[1] ?? [];
    const backControl = screen.getByRole("button", { name: en("presets.archive") });
    expect(isControl(back, backControl)).toBe(true);
  });

  it("deletes a preset after a confirmation, and the toast's Undo brings it back (QA round 25 R25-02)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetScreen from={undefined} id="deferred" />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("presets.archive") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.delete") }));
    await waitFor(() => {
      expect(presetOf(runtime, "deferred")?.archived).toBe(true);
    });
    await fireEvent.press(await screen.findByRole("button", { name: en("common.undo") }));
    await waitFor(() => {
      expect(presetOf(runtime, "deferred")?.archived).toBe(false);
    });
  });

  it("takes the Delete toast away once the preset is restored another way (QA round 26 R26-06)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetScreen from={undefined} id="deferred" />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("presets.archive") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.delete") }));
    expect(await screen.findByRole("button", { name: en("common.undo") })).toBeOnTheScreen();
    unwrapOk(await runtime.actions.restorePreset("deferred"));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: en("common.undo") })).toBeNull();
    });
  });

  it("opens a deleted preset as deleted, read-only, with Restore (QA round 25 R25-02)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.actions.archivePreset("deferred");
    await renderScreen(<PresetScreen from={undefined} id="deferred" />, runtime);
    expect(screen.getByText(en("presets.archivedNote"))).toBeOnTheScreen();
    // Nothing to edit or save on a deleted preset, and no second Delete.
    expect(screen.queryByRole("button", { name: en("common.save") })).toBeNull();
    expect(screen.queryByRole("button", { name: en("presets.archive") })).toBeNull();
    expect(screen.queryByLabelText(en("presets.name"))).toBeNull();
    // What would come back, read-only: its sample task, drawn with its settings (R26-07).
    expect(screen.getByText(en("presets.sampleTitle"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("presets.restore") }));
    await waitFor(() => {
      expect(presetOf(runtime, "deferred")?.archived).toBe(false);
    });
    // Restored, it is the ordinary form again.
    expect(await screen.findByRole("button", { name: en("common.save") })).toBeOnTheScreen();
  });

  it("goes to the list on Save when opened from a pasted link, not to Now (QA round 25 R25-12)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    // A link straight on /presets/new: More's list is the only screen under it.
    navigatorState.current = { index: 1, routes: [{ name: "more" }, { name: "presets/[id]" }] };
    await renderScreen(<PresetScreen from="work" id="new" />, runtime);
    await fireEvent.changeText(screen.getByLabelText(en("presets.name")), "Course work");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/presets");
    });
    expect(router.back).not.toHaveBeenCalled();
  });

  it("goes back to where it was opened from on Save when that is in the app", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    navigatorState.current = {
      index: 2,
      routes: [{ name: "more" }, { name: "presets/index" }, { name: "presets/[id]" }],
    };
    await renderScreen(<PresetScreen from="work" id="new" />, runtime);
    await fireEvent.changeText(screen.getByLabelText(en("presets.name")), "Course work");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("previews a sample task tagged with the preset's name, the name once (QA round 25 R25-14)", async () => {
    await renderScreen(
      <PresetScreen from="work" id="new" />,
      await createTestRuntime({ world: "empty" }),
    );
    await fireEvent.changeText(screen.getByLabelText(en("presets.name")), "Thesis");
    const [preview] = screen.getAllByLabelText(en("presets.preview"));
    expect(within(preview as never).getByText(en("presets.sampleTitle"))).toBeOnTheScreen();
    expect(within(preview as never).queryByText("Thesis 1")).toBeNull();
    expect(within(preview as never).getAllByText("Thesis")).toHaveLength(1);
  });

  it("creates a preset under an id from its name, which nobody types (QA round 18 L4)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetScreen from="hw" id="new" />, runtime);
    // The cursor is in Name on open, and there is no Id field to fill.
    expect(screen.getByLabelText(en("presets.name")).props).toMatchObject({ autoFocus: true });
    expect(screen.queryByLabelText("Id")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    expect(screen.getByText(en("presets.nameRequired"))).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(en("presets.name")), "Linear Algebra");
    // The refusal belonged to the old name: it goes once the name changes.
    expect(screen.queryByText(en("presets.nameRequired"))).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(linearAlgebra(runtime)).toMatchObject({ extends: "hw" });
    });
    // Read from the name, with a fresh id's end (two devices naming it alike offline differ).
    expect(linearAlgebra(runtime)?.id).toMatch(/^linear-algebra-[0-9a-z]{6}$/u);
  });

  it("refuses a second preset of the same name with a sentence, and writes nothing (QA 21 L4)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.actions.createPreset({
      definition: {},
      extends: "hw",
      id: "algebra",
      name: "Алгебра",
    });
    const before = runtime.state.store.getState().events.length;
    await renderScreen(<PresetScreen from="hw" id="new" />, runtime);
    await fireEvent.changeText(screen.getByLabelText(en("presets.name")), "алгебра ");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    // The sentence sits on the Name field, which takes the cursor back (R23-05).
    expect(await screen.findByText(en("actionError.preset/name-taken"))).toBeOnTheScreen();
    expect(screen.getByLabelText(en("presets.name"))).toHaveProp("aria-invalid", true);
    expect(runtime.state.store.getState().events).toHaveLength(before);
    await fireEvent.changeText(screen.getByLabelText(en("presets.name")), "Algebra II");
    expect(screen.queryByText(en("actionError.preset/name-taken"))).toBeNull();
  });

  it("keeps an existing preset's id and names the edit by the preset", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetScreen from={undefined} id="work" />, runtime);
    expect(screen.queryByLabelText("Id")).toBeNull();
    expect(screen.getByLabelText(en("presets.name")).props["autoFocus"]).not.toBe(true);
  });
});
