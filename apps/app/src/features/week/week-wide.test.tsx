import { act, fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router, setSearchParams } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { WeekScreen } from "./week-screen.tsx";

// A computer's window: the grid with a details pane beside it.
jest.mock("#app/ui/layout.ts", (): unknown => ({
  ...jest.requireActual("#app/ui/layout.ts"),
  useIsWide: () => true,
}));

/** The details pane: the shell's inspector, named for screen readers. */
const pane = () => screen.queryByLabelText(en("week.details"));

/** The shortcuts registered while mounted, by key: the web build's keyboard, as a test drives it. */
const mockHotkeys = new Map<string, () => void>();
jest.mock("#app/ui/use-hotkey.tsx", (): unknown => ({
  ...jest.requireActual("#app/ui/use-hotkey.tsx"),
  useHotkey: (hotkey: undefined | { readonly key: string }, onPress: () => void) => {
    if (hotkey !== undefined) {
      mockHotkeys.set(hotkey.key, onPress);
    }
  },
}));

/** Escape, as the web build's keyboard hands it to the shortcut registered last. */
const pressEscape = async (): Promise<void> => {
  await act(() => {
    mockHotkeys.get("Escape")?.();
  });
};

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
    // Nothing picked: no pane at all, the grid has the width (F-LAY-03).
    expect(pane()).toBeNull();
    const event = await screen.findByRole("button", { name: /, From the calendar: Seminar$/u });
    expect(event).not.toHaveProp("aria-current", "true");
    await fireEvent.press(event);
    expect(await screen.findByText("Room 214")).toBeOnTheScreen();
    expect(screen.getByText("University")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /, From the calendar: Seminar$/u })).toHaveProp(
      "aria-current",
      "true",
    );
    // A block next: the pane follows, and the mark moves with it.
    await fireEvent.press(screen.getByRole("button", { name: /, Lecture notes$/u }));
    expect(await screen.findByText("Study · 1h")).toBeOnTheScreen();
    expect(screen.queryByText("Room 214")).toBeNull();
    expect(screen.getByRole("button", { name: /, Lecture notes$/u })).toHaveProp(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /, From the calendar: Seminar$/u })).not.toHaveProp(
      "aria-current",
      "true",
    );
    expect(pane()).toBeOnTheScreen();
    // Closing the pane leaves nothing picked, and the pane goes.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(pane()).toBeNull();
    expect(screen.getByRole("button", { name: /, Lecture notes$/u })).not.toHaveProp(
      "aria-current",
      "true",
    );
  });

  it("lets go of the pick when the week changes, either way", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -180),
      label: "Lecture notes",
      startAt: addMinutesIso(NOW, -240),
    });
    await renderScreen(<WeekScreen />, runtime);
    const block = () => screen.getByRole("button", { name: /, Lecture notes$/u });
    await fireEvent.press(block());
    expect(await screen.findByText("Study · 1h")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Previous week" }));
    expect(pane()).toBeNull();
    expect(screen.queryByText("Study · 1h")).toBeNull();
    // Picked again, then Back to today: the pane goes again, and nothing stays marked.
    await fireEvent.press(screen.getByRole("button", { name: en("period.thisWeek") }));
    await fireEvent.press(block());
    expect(pane()).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Previous week" }));
    await fireEvent.press(screen.getByRole("button", { name: en("period.thisWeek") }));
    expect(pane()).toBeNull();
    expect(block()).not.toHaveProp("aria-current", "true");
  });

  it("lets go of a picked event when the address moves to another week, as browser Back does (review I1)", async () => {
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
    await renderScreen(<WeekScreen />, runtime);
    await fireEvent.press(
      await screen.findByRole("button", { name: /, From the calendar: Seminar$/u }),
    );
    expect(await screen.findByText("Room 214")).toBeOnTheScreen();
    await act(() => {
      setSearchParams({ week: "2026-09-28" });
    });
    expect(screen.getByText("Sep 28 – Oct 4")).toBeOnTheScreen();
    expect(pane()).toBeNull();
    expect(screen.queryByText("Room 214")).toBeNull();
  });

  it("closes the pane on Escape (UI review I4)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -180),
      label: "Lecture notes",
      startAt: addMinutesIso(NOW, -240),
    });
    await renderScreen(<WeekScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: /, Lecture notes$/u }));
    expect(pane()).toBeOnTheScreen();
    await pressEscape();
    expect(pane()).toBeNull();
  });

  it("offers to edit a block in its day, as Week only shows it (QA round 25 R25-07)", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "study",
      endAt: addMinutesIso(NOW, -180),
      label: "Lecture notes",
      startAt: addMinutesIso(NOW, -240),
    });
    await renderScreen(<WeekScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: /, Lecture notes$/u }));
    await fireEvent.press(await screen.findByRole("button", { name: en("week.editInDay") }));
    expect(router.push).toHaveBeenCalledWith({ params: { date: "2026-10-06" }, pathname: "/day" });
    expect(pane()).toBeNull();
  });
});
