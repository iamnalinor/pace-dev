import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Linking, type StyleProp, StyleSheet, type TextStyle, type ViewStyle } from "react-native";

import { classPx } from "#app/test/class-px.ts";
import { refusingStore } from "#app/test/refusing-store.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { paramsSet, searchParams, setSearchParams } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { problem } from "@pace/client/testing";
import { addMinutesIso, type CalendarEvent } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { BOTTOM_PX, LABELS_PX } from "./week-grid.tsx";
import {
  COLUMN_INSET_PX,
  lanesThatFit,
  laneStyle,
  MAX_LANES,
  PHONE_COLUMN_MAX_PX,
  phoneColumnPx,
} from "./week-lanes.ts";
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

/** An hour's label in the gutter: decoration, hidden from assistive tech (F-A11Y-09). */
const hourLabel = (hour: string) => screen.queryByText(hour, { includeHiddenElements: true });

/** How tall the gutter draws an hour (its "08" row). */
const hourHeight = (): unknown =>
  StyleSheet.flatten(
    (hourLabel("08")?.props as undefined | { style?: StyleProp<TextStyle> })?.style,
  ).height;

describe("WeekScreen", () => {
  it("lays the week's tracked time and calendar on one grid; a block lists the apps used during it", async () => {
    await renderScreen(<WeekScreen />, await world());
    expect(
      await screen.findByRole("button", { name: /, From the calendar: Seminar$/u }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: /, Lecture notes$/u }));
    expect(await screen.findByText("Study · 1h")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Apps during this" })).toBeOnTheScreen();
    expect(await screen.findByText("code")).toBeOnTheScreen();
    expect(screen.getByText("Laptop")).toBeOnTheScreen();
    expect(screen.getByText("40m")).toBeOnTheScreen();
    // One place for it: the old "where it sat" line is gone from the details.
    expect(screen.queryByText("Laptop: code 40m")).toBeNull();
  });

  it("opens an event's details in a sheet: its day with the month (R28-13), calendar, place, call, notes and people", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await renderScreen(<WeekScreen />, await world());
    await fireEvent.press(
      await screen.findByRole("button", { name: /, From the calendar: Seminar$/u }),
    );
    expect(await screen.findByText("Tue · Oct 6, 12:30–14:00")).toBeOnTheScreen();
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
      await screen.findByRole("button", { name: /, From the calendar: Call with Anna$/u }),
    );
    expect(await screen.findByText("Tue · Oct 6, 12:30–14:00")).toBeOnTheScreen();
    expect(screen.getByText("From the calendar")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Join the call" })).toBeNull();
    expect(screen.queryByText(/invited/u)).toBeNull();
  });

  it("offers This week only on another week, and it brings this week back", async () => {
    await renderScreen(<WeekScreen />, await world());
    const back = () => screen.queryByRole("button", { name: en("period.thisWeek") });
    expect(screen.getByText("Oct 5 – 11")).toBeOnTheScreen();
    expect(back()).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Previous week" }));
    expect(await screen.findByText("Sep 28 – Oct 4")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("period.thisWeek") }));
    expect(await screen.findByText("Oct 5 – 11")).toBeOnTheScreen();
    expect(back()).toBeNull();
  });

  it("names the week as Insights does, on one line, within a month and across two (design review 2 N2)", async () => {
    const language = jest.spyOn(globalThis.navigator, "language", "get").mockReturnValue("ru-RU");
    try {
      const page = await renderScreen(<WeekScreen />, await world());
      // «5 окт. – 11 окт.» wrapped its month onto a second line inside the pill at 390.
      expect(screen.getByText("5 – 11 окт.")).toHaveProp("numberOfLines", 1);
      await page.unmount();
      setSearchParams({ week: "2026-09-30" });
      await renderScreen(<WeekScreen />, await world());
      expect(screen.getByText("28 сент. – 4 окт.")).toHaveProp("numberOfLines", 1);
    } finally {
      language.mockRestore();
    }
  });

  it("keeps the week and the picked block in the address, and a reload opens both (feedback 5 item 6)", async () => {
    const runtime = await world();
    const page = await renderScreen(<WeekScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: /, Lecture notes$/u }));
    const { block } = searchParams();
    expect(block).toBeDefined();
    await page.unmount();
    const again = await renderScreen(<WeekScreen />, runtime);
    expect(await screen.findByText("Study · 1h")).toBeOnTheScreen();
    await again.unmount();
    setSearchParams({});
    await renderScreen(<WeekScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Previous week" }));
    expect(searchParams()).toEqual({ week: "2026-09-28" });
    await fireEvent.press(screen.getByRole("button", { name: en("period.thisWeek") }));
    expect(searchParams()).toEqual({});
  });

  it("opens the week the address names; a date or block it cannot read is the default, nothing written back", async () => {
    setSearchParams({ week: "2026-09-30" });
    const page = await renderScreen(<WeekScreen />, await world());
    expect(screen.getByText("Sep 28 – Oct 4")).toBeOnTheScreen();
    await page.unmount();
    setSearchParams({ block: "no-such-block", week: "2026-13-01" });
    await renderScreen(<WeekScreen />, await world());
    expect(screen.getByText("Oct 5 – 11")).toBeOnTheScreen();
    expect(screen.queryByText("Study · 1h")).toBeNull();
    expect(paramsSet).not.toHaveBeenCalled();
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

  it("names a block by its weekday, date and hours before its label (F-A11Y-09)", async () => {
    await renderScreen(<WeekScreen />, await world());
    const block = await screen.findByRole("button", { name: /, Lecture notes$/u });
    expect(block.props["accessibilityLabel"]).toMatch(
      /^Tue, Oct 6, \d\d:\d\d–\d\d:\d\d, Lecture notes$/u,
    );
    // The hour numbers are decoration: the grid's lines and the names above say the time.
    expect(screen.queryByText("08")).toBeNull();
  });

  it("draws each day's tracked time as a line under its name, and today's now mark on it", async () => {
    await renderScreen(<WeekScreen />, await world());
    await screen.findByRole("button", { name: /, Lecture notes$/u });
    expect(screen.getAllByTestId("day-header")).toHaveLength(7);
    const lines = screen.getAllByTestId("day-line");
    const [today] = screen.getAllByTestId("day-now");
    expect(today).toBeDefined();
    expect(screen.getAllByTestId("day-now")).toHaveLength(1);
    // Only today has a block in this world: one segment on one line.
    expect(lines.filter((line) => line.children.length > 0)).toHaveLength(1);
  });

  it("snaps the phone's days to whole days (F-LAY-11)", async () => {
    await renderScreen(<WeekScreen />, await world());
    const offsets = screen.getByTestId("week-days").props["snapToOffsets"] as readonly number[];
    expect(offsets).toHaveLength(7);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeGreaterThanOrEqual(72);
  });

  it("makes the phone's sideways days discoverable and keyboard reachable", async () => {
    await renderScreen(<WeekScreen />, await world());
    expect(screen.getByText("Swipe to see all days")).toBeOnTheScreen();
    expect(screen.getByTestId("week-days")).toHaveProp("tabIndex", 0);
  });

  it("names the night hours switch in words beside the moon, not as a bare dark-mode-like glyph (design review M13)", async () => {
    await renderScreen(<WeekScreen />, await createTestRuntime());
    const toggle = screen.getByRole("switch", { name: "Night hours" });
    expect(within(toggle).getByText("Night hours")).toBeOnTheScreen();
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
    expect(hourLabel("00")).toBeNull();
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
      expect(hourLabel("00")).not.toBeNull();
    });
    const gutter = hourLabel("00")?.parent as { readonly props: object };
    // The grid: the gutter and the columns in a row, with the room under them.
    const column = screen.getAllByTestId("week-column")[0] as {
      readonly props: { readonly style?: ViewStyle };
    };
    const dayName = screen.getAllByTestId("day-header")[0] as { readonly props: object };
    const hint = screen.getByText(en("week.scrollHint")).parent as { readonly props: object };
    // The room the fit subtracts is the room the classes draw: a class change shows here.
    expect(LABELS_PX).toBe(classPx(dayName, "h"));
    expect(BOTTOM_PX).toBe(classPx(hint, "h"));
    // The gutter's numbers start where the day names end.
    expect(classPx(gutter, "pt")).toBe(classPx(dayName, "h"));
    // The column's tail is the room under the grid: a short item at midnight hangs there.
    expect(column.props.style?.height).toBe(24 * Number(hourHeight()) + BOTTOM_PX);
    const drawn = classPx(dayName, "h") + Number(column.props.style?.height);
    expect(drawn).toBeLessThanOrEqual(700 - classPx(hint, "h"));
  });

  it("widens a phone's column by the insets its blocks keep, as the classes draw them (class 11, mirrors)", async () => {
    await renderScreen(<WeekScreen />, await world());
    await measure(700);
    const [blocks] = await screen.findAllByTestId("week-blocks");
    expect(blocks).toBeDefined();
    const area = blocks as { readonly props: object };
    expect(COLUMN_INSET_PX).toBe(classPx(area, "left") + classPx(area, "right"));
  });

  it("shows the night hours when asked, from the header and in the settings", async () => {
    const runtime = await world();
    await renderScreen(<WeekScreen />, runtime);
    await measure(700);
    const toggle = screen.getByRole("switch", { name: "Night hours" });
    expect(toggle).not.toBeChecked();
    expect(hourLabel("00")).toBeNull();
    await fireEvent.press(toggle);
    await waitFor(() => {
      expect(hourLabel("00")).not.toBeNull();
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
      expect(hourLabel("00")).toBeNull();
    });
    expect(hourLabel("07")).not.toBeNull();
  });

  it("draws a 0-minute block, which opens like any other (QA round 18 L7)", async () => {
    const runtime = await world([]);
    // Started and stopped at the same instant (the test world's clock stands still).
    await runtime.actions.startActivity({ category: "rest", label: "Zero" });
    await runtime.actions.stopActivity();
    await renderScreen(<WeekScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: /, Zero$/u }));
    expect(await screen.findByText("Rest · 0m")).toBeOnTheScreen();
  });
});

describe("WeekScreen states (spec §5.6)", () => {
  it("says what lands here, with a way to Now, when the week holds nothing", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/calendar": () => ({ events: [] }),
        "GET /api/usage": () => ({ sessions: [] }),
      },
      world: "empty",
    });
    await renderScreen(<WeekScreen />, runtime);
    expect(await screen.findByText(en("week.empty"))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: en("week.openNow") })).toBeOnTheScreen();
  });

  it("shows no empty state over a week with a block in it", async () => {
    await renderScreen(<WeekScreen />, await world());
    await screen.findByRole("button", { name: /Lecture notes/u });
    expect(screen.queryByText(en("week.empty"))).toBeNull();
  });

  it("says the calendar did not load, and reads it again on Try again", async () => {
    let calls = 0;
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/calendar": () => {
          calls += 1;
          return calls === 1 ? problem(503, "offline") : { events: [] };
        },
        "GET /api/usage": () => ({ sessions: [] }),
      },
    });
    await renderScreen(<WeekScreen />, runtime);
    expect(await screen.findByText(en("week.calendarFailed"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("common.retry") }));
    await waitFor(() => {
      expect(screen.queryByText(en("week.calendarFailed"))).toBeNull();
    });
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
      expect((width - COLUMN_INSET_PX) * (1 / lanes - 0.01)).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("lanesThatFit (a computer's columns do not widen)", () => {
  it("folds a run before a lane gets under 44 px: three lanes of a 120 px column were 38 wide", () => {
    for (const columnPx of [60, 120, 160, 240, 400]) {
      const lanes = lanesThatFit(columnPx);
      expect(lanes).toBeGreaterThanOrEqual(1);
      expect(lanes).toBeLessThanOrEqual(MAX_LANES);
      if (lanes > 1) {
        expect((columnPx - COLUMN_INSET_PX) * (1 / lanes - 0.01)).toBeGreaterThanOrEqual(44);
      }
    }
    expect(lanesThatFit(120)).toBe(2);
  });

  it("keeps the cap before the column is measured", () => {
    expect(lanesThatFit(0)).toBe(MAX_LANES);
  });
});
