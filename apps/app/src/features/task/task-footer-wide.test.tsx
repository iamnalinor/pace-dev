import { screen } from "@testing-library/react-native";

import { isAtTextWidth } from "#app/test/button-width.ts";
import { en, renderScreen } from "#app/test/render.tsx";
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

  it("names the way to another time or outcome in words, not a bare glyph (QA round 20 L3)", async () => {
    await renderScreen(<TaskScreen id={HW_ID} />, await createTestRuntime({ now: HW_VIEW_NOW }));
    const other = screen.getByRole("button", { name: en("task.doneOther") });
    expect(other).toHaveTextContent(en("task.doneOtherShort"));
    expect(en("task.doneOther").startsWith(en("task.doneOtherShort").replace("…", ""))).toBe(true);
  });
});
