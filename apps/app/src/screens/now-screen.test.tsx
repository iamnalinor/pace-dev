import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import type { PaceRuntime } from "#app/runtime.ts";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { NowScreen } from "./now-screen.tsx";

// A computer's window: the list with a pane beside it.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

const button = (key: Parameters<typeof en>[0]) => screen.getByRole("button", { name: en(key) });
/** The line (its label, "New task", is the + button's name as well). */
const line = () => screen.getByPlaceholderText(en("composer.placeholder"));
const title = () => screen.getByLabelText(en("edit.taskTitle"));
/** The picked task's details, by the action only they have. */
const taskDetails = () => screen.queryByRole("button", { name: en("task.edit") });

const titles = (runtime: PaceRuntime): readonly string[] =>
  Object.values(runtime.state.store.getState().tasks.byId).map((task) => task.title);

describe("NowScreen on a wide window", () => {
  it("opens the form in the right pane while the line stays in the list, then returns to the picked task", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<NowScreen />, runtime);
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(taskDetails()).toBeOnTheScreen();
    await fireEvent.press(button("nav.newTask"));
    // The pane holds the form in place of the task; the line is still in the list's column.
    expect(screen.getByRole("header", { name: en("composer.form.new") })).toBeOnTheScreen();
    expect(taskDetails()).toBeNull();
    expect(line()).toBeOnTheScreen();
    await fireEvent.changeText(title(), "pay the rent");
    await fireEvent(title(), "submitEditing");
    await waitFor(() => {
      expect(titles(runtime)).toContain("pay the rent");
    });
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(taskDetails()).toBeOnTheScreen();
  });

  it("closes back to the pane's empty state, the typed line kept", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(button("nav.newTask"));
    expect(title()).toHaveDisplayValue("renew the passport");
    await fireEvent.press(button("common.close"));
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(screen.getByText(en("now.pickTask"))).toBeOnTheScreen();
    expect(line()).toHaveDisplayValue("renew the passport");
  });

  it("shows a task picked while the form is open, the draft folded back into the line", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.changeText(line(), "renew the passport");
    await fireEvent.press(button("nav.newTask"));
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(screen.queryByLabelText(en("edit.taskTitle"))).toBeNull();
    expect(taskDetails()).toBeOnTheScreen();
    expect(line()).toHaveDisplayValue("renew the passport");
  });
});
