import { screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { KeyboardRow } from "./keyboard-row.tsx";

jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  KEYBOARD: "other",
}));

describe("Settings' keys", () => {
  it("lists Done and Save on Ctrl+Enter beside New task and Focus (QA round 27 R27-08)", async () => {
    await renderScreen(<KeyboardRow />, await createTestRuntime({ world: "empty" }));
    const line = screen.getByText(/Alt\+N/u);
    expect(line).toHaveTextContent(`Ctrl+Enter — ${en("settings.keyboard.primary")}`, {
      exact: false,
    });
    expect(line).toHaveTextContent(`Alt+N — ${en("settings.keyboard.newTask")}`, { exact: false });
  });
});
