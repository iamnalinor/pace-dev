import { screen } from "@testing-library/react-native";

import { isAtTextWidth } from "#app/test/button-width.ts";
import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { HW_ID, HW_VIEW_NOW } from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

// A computer's window: the task opens in Now's pane beside the list.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

describe("the task footer on a computer's window", () => {
  it("splits its width between Focus and the main action, both filling their halves", async () => {
    await renderScreen(<TaskScreen id={HW_ID} />, await createTestRuntime({ now: HW_VIEW_NOW }));
    expect(isAtTextWidth(screen.getByRole("button", { name: "Focus" }))).toBe(false);
    expect(isAtTextWidth(screen.getByRole("button", { name: "Submit 3 and 4" }))).toBe(false);
  });
});
