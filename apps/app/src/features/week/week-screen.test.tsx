import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Linking } from "react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso, type CalendarEvent } from "@pace/core";
import { NOW } from "@pace/core/testing";

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
    // 624 shared by the 24 hours.
    expect(hourHeight()).toBe(26);
    // Turned off elsewhere (the settings, another device): the grid follows while open.
    await act(async () => {
      await runtime.actions.setNightHours(false);
    });
    await waitFor(() => {
      expect(screen.queryByText("00")).toBeNull();
    });
    expect(within(screen.getByTestId("week-body")).getByText("07")).toBeOnTheScreen();
  });
});
