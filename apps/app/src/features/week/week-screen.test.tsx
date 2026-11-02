import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Linking, type ViewStyle } from "react-native";

import { classPx } from "#app/test/class-px.ts";
import { refusingStore } from "#app/test/refusing-store.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso, type CalendarEvent } from "@pace/core";
import { MOSCOW, NOW } from "@pace/core/testing";

import { BOTTOM_PX, dayLabel, LABELS_PX } from "./week-grid.tsx";
import { laneStyle, PHONE_COLUMN_MAX_PX, phoneColumnPx } from "./week-lanes.ts";
import { WeekScreen } from "./week-screen.tsx";

/** 12:30–14:00 in Moscow today, with everything a phone's calendar can tell about it. */
const seminar: CalendarEvent = {
  attendeeCount: 12,
  calendarName: "University",
  endAt: addMinutesIso(NOW, -60),
  id: "ev-1",
  location: "Room 214",
  notes: "Bring the sheet.\nSlides: https://example.org/slides",
  organizer: "Prof. Ivanova",
  series: null,
  startAt: addMinutesIso(NOW, -150),
  title: "Seminar",
  url: "https://meet.google.com/abc-defg-hij",
};

const world = async (events: readonly CalendarEvent[] = [seminar]) => {
  const runtime = await createTestRuntime({
    routes: {
      "GET /api/calendar": () => ({ events }),
      "GET /api/usage": () => ({
        sessions: [
          {
            app: "code",
            deviceId: "01LAPTOP",
            deviceName: "Laptop",
            endAt: addMinutesIso(NOW, -200),
            startAt: addMinutesIso(NOW, -250),
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
  return runtime;
};

/** The grid's room as the layout measures it. */
const measure = async (height: number): Promise<void> => {
  await fireEvent(screen.getByTestId("week-body"), "layout", {
    nativeEvent: { layout: { height, width: 390, x: 0, y: 0 } },
  });
};

/** How tall the gutter draws an hour (its "08" row). */
const hourHeight = (): unknown =>
  (screen.getByText("08").props as { style?: { height?: number } }).style?.height;

describe("WeekScreen", () => {
  it("lays the week's tracked time and calendar on one grid; a block lists the apps used during it", async () => {
    await renderScreen(<WeekScreen />, await world());
    expect(
      await screen.findByRole("button", { name: "From the calendar: Seminar" }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: /^Lecture notes, / }));
    expect(await screen.findByText("Study · 1h")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Apps during this" })).toBeOnTheScreen();
    expect(await screen.findByText("code")).toBeOnTheScreen();
    expect(screen.getByText("Laptop")).toBeOnTheScreen();
    expect(screen.getByText("40m")).toBeOnTheScreen();
    // One place for it: the old "where it sat" line is gone from the details.
    expect(screen.queryByText("Laptop: code 40m")).toBeNull();
  });

  it("opens an event's details in a sheet: calendar, place, call, notes and people", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await renderScreen(<WeekScreen />, await world());
    await fireEvent.press(
      await screen.findByRole("button", { name: "From the calendar: Seminar" }),
    );
    expect(await screen.findByText("6 Tue, 12:30–14:00")).toBeOnTheScreen();
    expect(screen.getByText("University")).toBeOnTheScreen();
    expect(screen.getByText("Organizer: Prof. Ivanova")).toBeOnTheScreen();
    expect(screen.getByText("12 people invited")).toBeOnTheScreen();
    expect(screen.getByText(/Bring the sheet\./u)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("link", { name: "Room 214" }));
    expect(openURL).toHaveBeenLastCalledWith(
      "https://www.google.com/maps/search/?api=1&query=Room%20214",
    );
    await fireEvent.press(screen.getByRole("link", { name: "https://example.org/slides" }));
    expect(openURL).toHaveBeenLastCalledWith("https://example.org/slides");
    await fireEvent.press(screen.getByRole("button", { name: "Join the call" }));
    expect(openURL).toHaveBeenLastCalledWith("https://meet.google.com/abc-defg-hij");
    openURL.mockRestore();
  });

  it("shows an event the phone told nothing more about with its time alone", async () => {
    const bare: CalendarEvent = {
      endAt: seminar.endAt,
      id: "ev-2",
      series: null,
      startAt: seminar.startAt,
      title: "Call with Anna",
    };
    await renderScreen(<WeekScreen />, await world([bare]));
    await fireEvent.press(
      await screen.findByRole("button", { name: "From the calendar: Call with Anna" }),
    );
    expect(await screen.findByText("6 Tue, 12:30–14:00")).toBeOnTheScreen();
    expect(screen.getByText("From the calendar")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Join the call" })).toBeNull();
    expect(screen.queryByText(/invited/u)).toBeNull();
  });

  it("offers Back to today only on another week, and it brings this week back", async () => {
    await renderScreen(<WeekScreen />, await world());
    const back = () => screen.queryByRole("button", { name: "Back to today" });
    expect(screen.getByText("Oct 5 – Oct 11")).toBeOnTheScreen();
    expect(back()).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Previous week" }));
    expect(await screen.findByText("Sep 28 – Oct 4")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Back to today" }));
    expect(await screen.findByText("Oct 5 – Oct 11")).toBeOnTheScreen();
    expect(back()).toBeNull();
  });

  it("fits the day into the measured height, and scrolls only below the floor", async () => {
    await renderScreen(<WeekScreen />, await world());
    await measure(700);
    // 700 less the day names (28), bottom room (24), and scroll hint (24), shared by 17 hours.
    await waitFor(() => {
      expect(hourHeight()).toBe(36);
    });
    expect(screen.getByTestId("week-scroller")).toHaveProp("scrollEnabled", false);
    await measure(300);
    await waitFor(() => {
      expect(hourHeight()).toBe(18);
    });
    expect(screen.getByTestId("week-scroller")).toHaveProp("scrollEnabled", true);
  });

  it("makes the phone's sideways days discoverable and keyboard reachable", async () => {
    await renderScreen(<WeekScreen />, await world());
    expect(screen.getByText("Swipe to see all days")).toBeOnTheScreen();
    expect(screen.getByTestId("week-days")).toHaveProp("tabIndex", 0);
  });

  it("says so and keeps the night hours off when the device refuses to save the header's switch", async () => {
    const disk = refusingStore();
    const runtime = await createTestRuntime({ eventStore: disk.eventStore });
    await renderScreen(<WeekScreen />, runtime);
    await measure(700);
    disk.refuse();
    await fireEvent.press(screen.getByRole("switch", { name: "Night hours" }));
    expect(await screen.findByText(en("actionError.persist_failed"))).toBeOnTheScreen();
    expect(screen.getByRole("switch", { name: "Night hours" })).not.toBeChecked();
    expect(screen.queryByText("00")).toBeNull();
  });

  it("fits the whole day as drawn (the day names, every hour, the room under it) in the measured height", async () => {
    const runtime = await world();
    await act(async () => {
      await runtime.actions.setNightHours(true);
    });
    await renderScreen(<WeekScreen />, runtime);
    // At 700 the old 28 px label constant drew 4 px past the room once the row was 32 px.
    await measure(700);
    await waitFor(() => {
      expect(screen.getByText("00")).toBeOnTheScreen();
    });
    const gutter = screen.getByText("00").parent as { readonly props: object };
    // The grid: the gutter and the columns in a row, with the room under them.
    const grid = screen.getByText("00").parent?.parent as {
      readonly props: { readonly style?: ViewStyle };
    };
    const dayName = screen.getByText(dayLabel(NOW, MOSCOW, "en"));
    const hint = screen.getByText(en("week.scrollHint")).parent as { readonly props: object };
    // The room the fit subtracts is the room the classes draw: a class change shows here.
    expect(LABELS_PX).toBe(classPx(dayName, "h"));
    expect(BOTTOM_PX).toBe(classPx(hint, "h"));
    // The gutter's numbers start where the day names end.
    expect(classPx(gutter, "pt")).toBe(classPx(dayName, "h"));
    const drawn =
      classPx(dayName, "h") + 24 * Number(hourHeight()) + Number(grid.props.style?.paddingBottom);
    expect(drawn).toBeLessThanOrEqual(700 - classPx(hint, "h"));
  });

  it("shows the night hours when asked, from the header and in the settings", async () => {
    const runtime = await world();
    await renderScreen(<WeekScreen />, runtime);
    await measure(700);
    const toggle = screen.getByRole("switch", { name: "Night hours" });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText("00")).toBeNull();
    await fireEvent.press(toggle);
    await waitFor(() => {
      expect(screen.getByText("00")).toBeOnTheScreen();
    });
    expect(screen.getByRole("switch", { name: "Night hours" })).toBeChecked();
    expect(runtime.state.store.getState().settings.nightHours).toBe(true);
    // 700 less the day names (32), the room under the grid (24) and the hint row (24): 620
    // shared by the 24 hours.
    expect(hourHeight()).toBe(25);
    // Turned off elsewhere (the settings, another device): the grid follows while open.
    await act(async () => {
      await runtime.actions.setNightHours(false);
    });
    await waitFor(() => {
      expect(screen.queryByText("00")).toBeNull();
    });
    expect(within(screen.getByTestId("week-body")).getByText("07")).toBeOnTheScreen();
  });

  it("draws a 0-minute block, which opens like any other (QA round 18 L7)", async () => {
    const runtime = await world([]);
    // Started and stopped at the same instant (the test world's clock stands still).
    await runtime.actions.startActivity({ category: "rest", label: "Zero" });
    await runtime.actions.stopActivity();
    await renderScreen(<WeekScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: /^Zero, / }));
    expect(await screen.findByText("Rest · 0m")).toBeOnTheScreen();
  });
});

describe("a day with many lanes side by side on a phone (round 7 review 11)", () => {
  it("caps the column's width: 20 and 100 lanes share a bounded column, never an endless one", () => {
    for (const lanes of [20, 100, 150]) {
      const width = phoneColumnPx(lanes, 72);
      expect(Number.isFinite(width)).toBe(true);
      expect(width).toBeGreaterThanOrEqual(72);
      expect(width).toBeLessThanOrEqual(PHONE_COLUMN_MAX_PX);
    }
    // Up to the cap, every lane still keeps its 44 px.
    expect(phoneColumnPx(4, 72)).toBeLessThanOrEqual(PHONE_COLUMN_MAX_PX);
  });

  it("gives every lane of 20 or 100 a width above nothing, inside the column", () => {
    for (const lanes of [20, 100]) {
      const last = laneStyle({ lane: lanes - 1, lanes });
      const left = Number(last.left.replace("%", ""));
      const width = Number(last.width.replace("%", ""));
      expect(width).toBeGreaterThan(0);
      expect(left + width).toBeLessThanOrEqual(100);
    }
  });
});

describe("phoneColumnPx", () => {
  it("keeps the 72 px floor for one lane and gives every lane 44 px otherwise", () => {
    expect(phoneColumnPx(1, 72)).toBe(72);
    for (const lanes of [2, 3, 4]) {
      const width = phoneColumnPx(lanes, 72);
      expect((width - 8) * (1 / lanes - 0.01)).toBeGreaterThanOrEqual(44);
    }
  });
});
