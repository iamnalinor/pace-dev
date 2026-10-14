import * as Calendar from "expo-calendar";

import type { FakeCalendar } from "#app/testing/calendar.fake.ts";

import { calendarEvents } from "./phone-calendar.ts";

const calendar = Calendar as unknown as FakeCalendar;

describe("the phone's calendar events", () => {
  it("keeps the instants expo-calendar's Android module hands out (UTC, '.SSSZ')", async () => {
    // A 12:15–15:20 colloquium in Moscow (UTC+3), as CalendarUtils.sdf formats Instances.BEGIN/END.
    calendar.state.status = "granted";
    calendar.state.events = [
      {
        allDay: false,
        endDate: "2026-10-14T12:20:00.000Z",
        id: "ev-1",
        recurrenceRule: null,
        startDate: "2026-10-14T09:15:00.000Z",
        title: " Коллоквиум по матанализу ",
      },
    ];
    const events = await calendarEvents("2026-10-13T21:00:00.000Z", "2026-10-14T21:00:00.000Z");
    expect(events).toEqual([
      {
        endAt: "2026-10-14T12:20:00.000Z",
        id: "ev-1",
        series: null,
        startAt: "2026-10-14T09:15:00.000Z",
        title: "Коллоквиум по матанализу",
      },
    ]);
  });
});
