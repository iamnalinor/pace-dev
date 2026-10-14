import { fireEvent, screen } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { WeekScreen } from "./week-screen.tsx";

// A computer's window: the grid with a details pane beside it.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

describe("WeekScreen on a wide window", () => {
  it("shows what was picked in the pane beside the grid, the picked one marked", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/calendar": () => ({
          events: [
            {
              calendarName: "University",
              endAt: addMinutesIso(NOW, -60),
              id: "ev-1",
              location: "Room 214",
              series: null,
              startAt: addMinutesIso(NOW, -150),
              title: "Seminar",
            },
          ],
        }),
      },
    });
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -180),
      label: "Lecture notes",
      startAt: addMinutesIso(NOW, -240),
    });
    await renderScreen(<WeekScreen />, runtime);
    expect(screen.getByText("Pick an event or a block to see its details")).toBeOnTheScreen();
    const event = await screen.findByRole("button", { name: "From the calendar: Seminar" });
    expect(event).not.toBeSelected();
    await fireEvent.press(event);
    expect(await screen.findByText("Room 214")).toBeOnTheScreen();
    expect(screen.getByText("University")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "From the calendar: Seminar" })).toBeSelected();
    // A block next: the pane follows, and the mark moves with it.
    await fireEvent.press(screen.getByRole("button", { name: /^Lecture notes, / }));
    expect(await screen.findByText("Study · 1h")).toBeOnTheScreen();
    expect(screen.queryByText("Room 214")).toBeNull();
    expect(screen.getByRole("button", { name: /^Lecture notes, / })).toBeSelected();
    expect(screen.getByRole("button", { name: "From the calendar: Seminar" })).not.toBeSelected();
    // Closing the pane leaves nothing picked.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Pick an event or a block to see its details")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Lecture notes, / })).not.toBeSelected();
  });
});
