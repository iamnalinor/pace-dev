import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";
import * as SecureStore from "expo-secure-store";

import type { FakeCalendar } from "#app/testing/calendar.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { DayScreen } from "./day-screen.tsx";

const utc = (iso: string): number => Date.parse(`2026-10-${iso}:00.000Z`);

/** A night in Moscow (UTC+3): screen off 23:50, a glance at 03:10, up at 07:40, Telegram at noon. */
const mockEvents = [
  { className: null, eventType: 15, packageName: "android", timestamp: utc("05T19:00") },
  { className: null, eventType: 16, packageName: "android", timestamp: utc("05T20:50") },
  { className: null, eventType: 15, packageName: "android", timestamp: utc("06T00:10") },
  { className: null, eventType: 16, packageName: "android", timestamp: utc("06T00:14") },
  { className: null, eventType: 15, packageName: "android", timestamp: utc("06T04:40") },
  { className: null, eventType: 16, packageName: "android", timestamp: utc("06T04:50") },
  { className: null, eventType: 15, packageName: "android", timestamp: utc("06T09:00") },
  {
    className: null,
    eventType: 1,
    packageName: "org.telegram.messenger",
    timestamp: utc("06T09:00"),
  },
  {
    className: null,
    eventType: 2,
    packageName: "org.telegram.messenger",
    timestamp: utc("06T09:20"),
  },
  { className: null, eventType: 16, packageName: "android", timestamp: utc("06T09:30") },
];

const mockAccess = { granted: true };

jest.mock("../../../modules/pace-native/index.ts", () => ({
  paceNative: {
    appLabels: async (packages: readonly string[]) =>
      Object.fromEntries(
        packages.map((name) => [name, name === "org.telegram.messenger" ? "Telegram" : name]),
      ),
    hasUsageAccess: () => mockAccess.granted,
    openUsageAccessSettings: jest.fn(),
    queryUsageEvents: async () => (mockAccess.granted ? mockEvents : []),
  },
}));

const calendar = Calendar as unknown as FakeCalendar;

beforeEach(() => {
  // What a test waved away stays on its fake phone only.
  (SecureStore as unknown as FakeSecureStore).values.clear();
  mockAccess.granted = true;
  calendar.state.status = "granted";
  calendar.state.events = [
    {
      allDay: false,
      endDate: "2026-10-06T11:00:00.000Z",
      id: "ev-1",
      startDate: "2026-10-06T10:00:00.000Z",
      title: "Seminar",
    },
  ];
});

const activities = (runtime: Awaited<ReturnType<typeof createTestRuntime>>) =>
  Object.values(runtime.state.store.getState().time.activities);

describe("Day with the phone's data", () => {
  it("offers last night's sleep, shows phone time in a block and the calendar's events", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "study",
      endAt: "2026-10-06T09:30:00.000Z",
      label: "Lecture",
      startAt: "2026-10-06T08:50:00.000Z",
    });
    await renderScreen(<DayScreen />, runtime);

    expect(await screen.findByText("Slept 23:50–07:40 · 7h 50m · woke up 1×")).toBeOnTheScreen();
    expect(await screen.findByText("Phone 20m: Telegram 20m")).toBeOnTheScreen();
    const seminar = await screen.findByText("Seminar");
    expect(seminar).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Log sleep" }));
    await waitFor(() => {
      expect(activities(runtime).find((activity) => activity.category === "sleep")).toMatchObject({
        endAt: "2026-10-06T04:40:00.000Z",
        label: "Sleep",
        startAt: "2026-10-05T20:50:00.000Z",
      });
    });
    await waitFor(() => {
      expect(screen.queryByText(/^Slept /u)).toBeNull();
    });

    const calendarList = screen.getByLabelText("From your calendar");
    await fireEvent.press(within(calendarList).getByRole("button", { name: "Attended" }));
    await waitFor(() => {
      expect(activities(runtime).some((activity) => activity.label === "Seminar")).toBe(true);
    });
    expect(
      await within(screen.getByLabelText("From your calendar")).findByText("logged"),
    ).toBeOnTheScreen();
  });

  it("waves a wrong sleep guess and a calendar event away for good", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<DayScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: "Not sleep" }));
    await waitFor(() => {
      expect(screen.queryByText(/^Slept /u)).toBeNull();
    });
    await fireEvent.press(
      within(screen.getByLabelText("From your calendar")).getByRole("button", { name: "Skip" }),
    );
    await waitFor(() => {
      expect(screen.queryByText("Seminar")).toBeNull();
    });
    expect(activities(runtime)).toEqual([]);
  });

  it("asks for usage access and the calendar when they are off", async () => {
    mockAccess.granted = false;
    calendar.state.status = "undetermined";
    await renderScreen(<DayScreen />, await createTestRuntime());
    expect(
      await screen.findByRole("button", {
        name: "Allow usage access to see your sleep and phone time here",
      }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Show my calendar's events here" }));
    expect(await screen.findByText("Seminar")).toBeOnTheScreen();
  });
});
