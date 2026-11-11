import { screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { withWindowWidth } from "#app/test/window.ts";

import { KeyboardRow } from "./keyboard-row.tsx";

jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  KEYBOARD: "other",
}));

describe("Settings' keys on a computer", () => {
  withWindowWidth(1440);

  it("lists Done and Save on Ctrl+Enter beside New task and Focus (QA round 27 R27-08)", async () => {
    await renderScreen(<KeyboardRow />, await createTestRuntime({ world: "empty" }));
    const line = screen.getByText(/Alt\+N/u);
    expect(line).toHaveTextContent(`Ctrl+Enter — ${en("settings.keyboard.primary")}`, {
      exact: false,
    });
    expect(line).toHaveTextContent(`Alt+N — ${en("settings.keyboard.newTask")}`, { exact: false });
  });
});

describe("Settings' keys at a phone's width", () => {
  it("are not listed: a phone's layout shows no key hint anywhere (QA PR55-1-17)", async () => {
    await renderScreen(<KeyboardRow />, await createTestRuntime({ world: "empty" }));
    expect(screen.queryByText(en("settings.keyboard"))).toBeNull();
  });
});
