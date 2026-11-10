import { fireEvent, screen } from "@testing-library/react-native";

import { NowScreen } from "#app/screens/now-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

// A computer's window with a keyboard: New task opens in the 400 px pane beside Now's list.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));
jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  KEYBOARD: "other",
}));

describe("New task in the pane (QA round 27 R27-08, round 28 R28-07)", () => {
  it("names Ctrl+Enter on Create's tooltip and hint, as the button has no room for it", async () => {
    await renderScreen(<NowScreen />, await createTestRuntime());
    await fireEvent.changeText(screen.getByPlaceholderText(en("composer.placeholder")), "Rent");
    const [newTask] = screen.getAllByRole("button", { name: /^New task/u });
    if (newTask === undefined) {
      throw new Error("New task is drawn");
    }
    await fireEvent.press(newTask);
    const create = screen.getByRole("button", { name: /^Create/u });
    expect(create.props["accessibilityHint"]).toBe(`${en("form.create")} · Ctrl+Enter`);
  });
});
