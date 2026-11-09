import { screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { ActivityPane } from "./activity-pane.tsx";

// A computer's window with a keyboard: the editor opens in the 400 px inspector beside Day.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));
jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  KEYBOARD: "other",
}));

const NOTHING = (): void => undefined;

describe("the activity editor in the pane (design review 2 N11)", () => {
  it("drops Save's shortcut hint in the pane: «Изменить занятие» wrapped beside «Сохранить Ctrl+Enter»", async () => {
    await renderScreen(
      <ActivityPane
        onClose={NOTHING}
        target={{
          activityId: "a1",
          category: "study",
          endAt: "2026-10-06T10:00:00.000Z",
          kind: "edit",
          label: "Reading",
          startAt: "2026-10-06T09:00:00.000Z",
          taskId: null,
        }}
        zone="Europe/Moscow"
      />,
      await createTestRuntime(),
    );
    const save = screen.getByRole("button", { name: en("common.save") });
    expect(save).toBeOnTheScreen();
    expect(screen.queryByText(/Enter/u, { includeHiddenElements: true })).toBeNull();
  });
});
