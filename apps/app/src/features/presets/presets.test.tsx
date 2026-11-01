import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { PresetScreen } from "#app/screens/preset-screen.tsx";
import { isControl } from "#app/test/focus-target.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
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

const presetOf = (runtime: PaceRuntime, id: string) =>
  runtime.state.store.getState().presets.byId[id];

describe("PresetsList", () => {
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
    await fireEvent.press(screen.getByRole("radio", { name: "Work" }));
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
    await fireEvent(override, "valueChange", true);
    await fireEvent.press(screen.getByRole("radio", { name: en("color.coral") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(presetOf(runtime, "work")?.definition).toEqual({ color: "coral" });
    });
    expect(router.back).toHaveBeenCalled();
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

  it("deletes a preset after a confirmation", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetScreen from={undefined} id="deferred" />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("presets.archive") }));
    await fireEvent.press(screen.getByRole("button", { name: en("common.delete") }));
    await waitFor(() => {
      expect(presetOf(runtime, "deferred")?.archived).toBe(true);
    });
  });

  it("creates a preset: the id follows the name, and a name is required", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await renderScreen(<PresetScreen from="hw" id="new" />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    expect(screen.getByRole("alert")).toHaveTextContent(en("presets.nameRequired"));
    await fireEvent.changeText(screen.getByLabelText(en("presets.name")), "Linear Algebra");
    expect(screen.getByLabelText(en("presets.id"))).toHaveDisplayValue("linear-algebra");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(presetOf(runtime, "linear-algebra")).toMatchObject({
        extends: "hw",
        name: "Linear Algebra",
      });
    });
  });
});
