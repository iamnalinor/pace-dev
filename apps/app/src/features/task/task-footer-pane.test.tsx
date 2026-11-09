import { screen, within } from "@testing-library/react-native";

import { TaskPaneProvider } from "#app/shared/task-opener.tsx";
import { isAtTextWidth } from "#app/test/button-width.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, HW_VIEW_NOW } from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

// A computer's window with a keyboard: the task opens in the 400 px pane beside Now's list.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));
jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  KEYBOARD: "other",
}));

const NOTHING = (): void => undefined;

const renderInPane = async (): Promise<void> => {
  await renderScreen(
    <TaskPaneProvider onClose={NOTHING}>
      <TaskScreen id={HW_ID} />
    </TaskPaneProvider>,
    await createTestRuntime({ now: HW_VIEW_NOW }),
  );
};

describe("the task footer in the pane beside the list (design review B1)", () => {
  it("keeps Focus and Done as the only two on their row, each filling its half", async () => {
    await renderInPane();
    const focus = screen.getByRole("button", { name: "Focus" });
    const done = screen.getByRole("button", { name: en("task.done") });
    expect(isAtTextWidth(focus)).toBe(false);
    expect(isAtTextWidth(done)).toBe(false);
    const row = screen.getByTestId("task-footer-main");
    expect(within(row).getAllByRole("button")).toHaveLength(2);
  });

  it("drops the shortcut hints in the pane: they squeezed «Готово» into a letter a line", async () => {
    await renderInPane();
    const row = screen.getByTestId("task-footer-main");
    expect(within(row).queryByText(/Enter/u, { includeHiddenElements: true })).toBeNull();
  });

  it("puts the other time or outcome under them, named in full", async () => {
    await renderInPane();
    const other = screen.getByRole("button", { name: en("task.doneOther") });
    expect(other).toHaveTextContent(en("task.doneOther"));
    const row = screen.getByTestId("task-footer-main");
    expect(within(row).queryByRole("button", { name: en("task.doneOther") })).toBeNull();
  });
});
