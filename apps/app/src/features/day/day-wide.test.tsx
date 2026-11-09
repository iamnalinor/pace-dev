import { act, fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { setSearchParams } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { DayScreen } from "./day-screen.tsx";

// A computer's window: the day with the editor in the shell's inspector.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

const inspector = () => screen.queryByLabelText(en("day.details"));

describe("DayScreen on a wide window", () => {
  it("opens the editor in the inspector for a picked block, collapsed otherwise (F-LAY-03)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "work",
      endAt: addMinutesIso(NOW, -240),
      label: "Team chat",
      startAt: addMinutesIso(NOW, -270),
    });
    await renderScreen(<DayScreen />, runtime);
    expect(inspector()).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /Team chat/u }));
    expect(inspector()).toBeOnTheScreen();
    expect(screen.getByLabelText("What")).toHaveDisplayValue("Team chat");
    // The picked row is marked, and the editor closes without touching the day.
    await fireEvent.press(screen.getByRole("button", { name: en("common.close") }));
    expect(inspector()).toBeNull();
  });

  it("drops the picked block when the address moves to another day, as browser Back does (review I1)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "work",
      endAt: addMinutesIso(NOW, -240),
      label: "Team chat",
      startAt: addMinutesIso(NOW, -270),
    });
    await renderScreen(<DayScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: /Team chat/u }));
    expect(inspector()).toBeOnTheScreen();
    // Back to the day before: the screen stays mounted and only its param changes.
    await act(() => {
      setSearchParams({ date: "2026-10-05" });
    });
    expect(screen.getByText("Mon, Oct 5")).toBeOnTheScreen();
    expect(inspector()).toBeNull();
    // Forward to the day it was picked on shows it again: the pick belongs to that day.
    await act(() => {
      setSearchParams({});
    });
    expect(inspector()).toBeOnTheScreen();
  });
});
