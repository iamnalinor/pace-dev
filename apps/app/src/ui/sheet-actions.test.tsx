import { screen } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { SheetActions } from "./sheet-actions.tsx";

const NOTHING = (): void => undefined;

const rowClasses = (): readonly string[] =>
  String(screen.getByTestId("sheet-actions").props["className"]).split(" ");

describe("SheetActions", () => {
  it("keeps a confirmation's Cancel beside a wider action by default", async () => {
    await renderScreen(
      <SheetActions
        cancelLabel="Cancel"
        onCancel={NOTHING}
        onPrimary={NOTHING}
        primaryLabel="Wipe"
      />,
      await createTestRuntime(),
    );
    expect(rowClasses()).toContain("flex-row");
  });

  it("stacks Cancel and the action when asked: a long action ran three lines (design review H3)", async () => {
    await renderScreen(
      <SheetActions
        cancelLabel="Cancel"
        isStacked
        onCancel={NOTHING}
        onPrimary={NOTHING}
        primaryLabel="Очистить через Telegram"
      />,
      await createTestRuntime(),
    );
    expect(rowClasses()).not.toContain("flex-row");
  });
});
