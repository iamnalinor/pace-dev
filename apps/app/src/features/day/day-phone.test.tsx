import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Calendar from "expo-calendar";
import * as SecureStore from "expo-secure-store";

import type * as PhoneMemory from "#app/platform/phone-memory.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { seriesRules, setSeriesRule } from "#app/platform/phone-memory.ts";
import { heldRoute } from "#app/test/held-route.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { rowsInFlattenableBoxes } from "#app/test/sliding-rows.ts";
import { FAKE_OWNER, type FakeCalendar } from "#app/testing/calendar.fake.ts";
import { calendarEventKey, type PoolNotification, type Resolution } from "@pace/core";

import { DayScreen } from "./day-screen.tsx";

/** A clock time of the test day (6 October) as a UTC instant. */
const utcAt = (clock: string): string => `2026-10-06T${clock}.000Z`;

const utc = (iso: string): number => Date.parse(`2026-10-${iso}:00.000Z`);

/** A night in Moscow (UTC+3): phone put away 23:50, used at 03:10, up at 07:40, Telegram at noon. */
const mockEvents = [
  { className: null, eventType: 15, packageName: "android", timestamp: utc("05T19:00") },
  { className: null, eventType: 18, packageName: "android", timestamp: utc("05T19:00") },
  { className: null, eventType: 16, packageName: "android", timestamp: utc("05T20:50") },
  { className: null, eventType: 15, packageName: "android", timestamp: utc("06T00:10") },
  { className: null, eventType: 18, packageName: "android", timestamp: utc("06T00:10") },
  { className: null, eventType: 16, packageName: "android", timestamp: utc("06T00:14") },
  { className: null, eventType: 15, packageName: "android", timestamp: utc("06T04:40") },
  { className: null, eventType: 18, packageName: "android", timestamp: utc("06T04:40") },
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

/** The night above; a test may add events after it. */
const NIGHT_EVENTS = mockEvents.length;

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

/** Holds the phone's write of a dismissal while set: Android's keystore is slow to write. */
const mockDismissHold: { current: null | Promise<unknown>; waiting: number } = {
  current: null,
  waiting: 0,
};
jest.mock("#app/platform/phone-memory.ts", (): unknown => {
  const actual = jest.requireActual<typeof PhoneMemory>("#app/platform/phone-memory.ts");
  return {
    ...actual,
    dismiss: async (key: string) => {
      if (mockDismissHold.current !== null) {
        mockDismissHold.waiting += 1;
        await mockDismissHold.current;
      }
      await actual.dismiss(key);
    },
  };
});

const calendar = Calendar as unknown as FakeCalendar;

beforeEach(() => {
  // What a test waved away stays on its fake phone only.
  (SecureStore as unknown as FakeSecureStore).values.clear();
  (SecureStore as unknown as FakeSecureStore).values.set("pace.session", "session-test");
  mockEvents.splice(NIGHT_EVENTS);
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
    {
      allDay: false,
      attendees: [
        { email: "dean@example.com", status: "accepted" },
        { email: FAKE_OWNER, status: "declined" },
      ],
      endDate: "2026-10-06T13:00:00.000Z",
      id: "ev-declined",
      organizerEmail: "dean@example.com",
      startDate: "2026-10-06T12:00:00.000Z",
      title: "Faculty meeting",
    },
  ];
});

const activities = (runtime: Awaited<ReturnType<typeof createTestRuntime>>) =>
  Object.values(runtime.state.store.getState().time.activities);

describe("Day with the phone's data", () => {
  it("shows phone time in a block and the calendar's events, and asks nothing about sleep", async () => {
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "study",
      endAt: "2026-10-06T09:30:00.000Z",
      label: "Lecture",
      startAt: "2026-10-06T08:50:00.000Z",
    });
    await renderScreen(<DayScreen />, runtime);

    // Where the time went on the phone, with no penalty for it.
    expect(await screen.findByText("Phone 20m: Telegram 20m")).toBeOnTheScreen();
    const seminar = await screen.findByText("Seminar");
    expect(seminar).toBeOnTheScreen();
    // A declined invitation is not the person's to attend.
    expect(screen.queryByText("Faculty meeting")).toBeNull();
    // Sleep is recorded on the server from the uses it is sent: Day asks nothing about the night.
    expect(screen.queryByText("Last night")).toBeNull();
    expect(screen.queryByText(/^Slept /u)).toBeNull();
    expect(screen.queryByRole("button", { name: "Log sleep" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Not sleep" })).toBeNull();

    const calendarList = screen.getByLabelText("From your calendar");
    await fireEvent.press(within(calendarList).getByRole("button", { name: "Attended" }));
    await waitFor(() => {
      expect(activities(runtime).some((activity) => activity.label === "Seminar")).toBe(true);
    });
    expect(
      await within(screen.getByLabelText("From your calendar")).findByText("logged"),
    ).toBeOnTheScreen();
    expect(activities(runtime).some((activity) => activity.category === "sleep")).toBe(false);
  });

  // The activity begins at the event's start once that has passed, else now (12:00 UTC).
  it.each([
    { begins: "11:50:00", from: "11:50:00", name: "has been on for 10 minutes", to: "12:50:00" },
    { begins: "11:59:59", from: "11:59:59", name: "started a second ago", to: "12:50:00" },
    { begins: "12:00:00", from: "12:00:01", name: "starts in a second", to: "12:50:00" },
    { begins: "12:00:00", from: "12:02:00", name: "starts in 2 minutes", to: "12:50:00" },
    { begins: "12:00:00", from: "12:15:00", name: "starts in 15 minutes", to: "13:00:00" },
  ])(
    "attends an event that $name: it is tracked, never refused as the future, then reads logged",
    async ({ begins, from, to }) => {
      calendar.state.events = [
        {
          allDay: false,
          endDate: utcAt(to),
          id: "ev-soon",
          startDate: utcAt(from),
          title: "Colloquium",
        },
      ];
      const runtime = await createTestRuntime();
      await renderScreen(<DayScreen />, runtime);
      const list = await screen.findByLabelText("From your calendar");
      await fireEvent.press(within(list).getByRole("button", { name: "Attended" }));
      await waitFor(() => {
        expect(
          activities(runtime).find((activity) => activity.label === "Colloquium"),
        ).toMatchObject({ endAt: null, startAt: utcAt(begins) });
      });
      expect(screen.queryByText("That time is in the future.")).toBeNull();
      // Answered: the row reads "logged", so a second tap cannot start it over.
      expect(await within(list).findByText("logged")).toBeOnTheScreen();
      expect(within(list).queryByRole("button", { name: "Attended" })).toBeNull();
      expect(within(list).queryByRole("button", { name: "Skip" })).toBeNull();
    },
  );

  it("keeps the day's blocks in a box of their own, so the cards above cannot move them", async () => {
    // The calendar arrives after the blocks: on Android a flattened box would
    // hand their arrival to every block's own layout transition (see RowList).
    const runtime = await createTestRuntime();
    await runtime.actions.logPast({
      category: "other",
      endAt: utcAt("10:00:00"),
      label: "Reading",
      startAt: utcAt("09:00:00"),
    });
    await renderScreen(<DayScreen />, runtime);
    await screen.findByLabelText("From your calendar");
    expect(await screen.findByText("Reading")).toBeOnTheScreen();
    expect(rowsInFlattenableBoxes()).toEqual([]);
  });

  it("reads logged after attending an event whose title is longer than an activity's label", async () => {
    const title = `Mathematical analysis colloquium ${"with a very long name ".repeat(4)}`.trim();
    calendar.state.events = [
      {
        allDay: false,
        endDate: utcAt("12:50:00"),
        id: "ev-long",
        startDate: utcAt("12:05:00"),
        title,
      },
    ];
    const runtime = await createTestRuntime();
    await renderScreen(<DayScreen />, runtime);
    const list = await screen.findByLabelText("From your calendar");
    await fireEvent.press(within(list).getByRole("button", { name: "Attended" }));
    expect(await within(list).findByText("logged")).toBeOnTheScreen();
    expect(within(list).queryByRole("button", { name: "Attended" })).toBeNull();
  });

  it("does not offer Attended for an event hours away, only Skip", async () => {
    calendar.state.events = [
      {
        allDay: false,
        endDate: "2026-10-06T16:00:00.000Z",
        id: "ev-later",
        startDate: "2026-10-06T15:00:00.000Z",
        title: "Evening lecture",
      },
    ];
    await renderScreen(<DayScreen />, await createTestRuntime());
    const list = await screen.findByLabelText("From your calendar");
    expect(within(list).queryByRole("button", { name: "Attended" })).toBeNull();
    expect(within(list).getByRole("button", { name: "Skip" })).toBeOnTheScreen();
  });

  it("waves a calendar event away for good", async () => {
    const runtime = await createTestRuntime({
      routes: { "POST /api/calendar/skip": () => ({ ok: true }) },
    });
    await renderScreen(<DayScreen />, runtime);
    await fireEvent.press(
      within(await screen.findByLabelText("From your calendar")).getByRole("button", {
        name: "Skip",
      }),
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

  it("offers to end an overrun activity when the phone was picked up", async () => {
    // Lunch from 14:00 Moscow (Expect 30m); the phone came out at 14:40 and is still in hand.
    mockEvents.push(
      { className: null, eventType: 15, packageName: "android", timestamp: utc("06T11:40") },
      { className: null, eventType: 18, packageName: "android", timestamp: utc("06T11:40") },
    );
    const runtime = await createTestRuntime();
    await runtime.actions.startActivity(
      { category: "food", expectMinutes: 30, label: "Lunch" },
      { at: "2026-10-06T11:00:00.000Z" },
    );
    await renderScreen(<DayScreen />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: "Ended at 14:40?" }));
    await waitFor(() => {
      expect(activities(runtime).find((activity) => activity.label === "Lunch")).toMatchObject({
        endAt: "2026-10-06T11:40:00.000Z",
      });
    });
  });

  it("remembers a repeating event's answer for the whole series", async () => {
    calendar.state.events = [
      {
        allDay: false,
        calendarId: "cal-1",
        endDate: "2026-10-06T07:15:00.000Z",
        id: "standup-6",
        recurrenceRule: { frequency: "daily" },
        startDate: "2026-10-06T07:00:00.000Z",
        title: "Standup",
      },
    ];
    const runtime = await createTestRuntime();
    await renderScreen(<DayScreen />, runtime);
    const list = await screen.findByLabelText("From your calendar");
    await fireEvent.press(within(list).getByRole("button", { name: "Attended" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Every time" }));
    expect(await screen.findByText("Will do the same every time")).toBeOnTheScreen();
    expect(await seriesRules()).toEqual([
      { rule: "attended", series: "cal-1:Standup", title: "Standup" },
    ]);
  });

  it("logs an always-attended series by itself and hides an always-skipped one", async () => {
    await setSeriesRule({ rule: "attended", series: "cal-1:Standup", title: "Standup" });
    await setSeriesRule({ rule: "skip", series: "cal-1:Gym", title: "Gym" });
    const daily = { frequency: "daily" };
    calendar.state.events = [
      {
        allDay: false,
        calendarId: "cal-1",
        endDate: "2026-10-06T07:15:00.000Z",
        id: "standup-6",
        recurrenceRule: daily,
        startDate: "2026-10-06T07:00:00.000Z",
        title: "Standup",
      },
      {
        allDay: false,
        calendarId: "cal-1",
        endDate: "2026-10-06T06:00:00.000Z",
        id: "gym-6",
        recurrenceRule: daily,
        startDate: "2026-10-06T05:00:00.000Z",
        title: "Gym",
      },
    ];
    const runtime = await createTestRuntime();
    await renderScreen(<DayScreen />, runtime);
    await waitFor(() => {
      expect(activities(runtime).map((activity) => activity.label)).toEqual(["Standup"]);
    });
    expect(screen.queryByText("Gym")).toBeNull();
  });
});

const seminar = { startAt: "2026-10-06T10:00:00.000Z", title: "Seminar" };

/** The seminar's "event starting", answered on another channel (Telegram, the web, a phone). */
const answeredElsewhere = (resolution: Resolution): PoolNotification => ({
  createdAt: seminar.startAt,
  id: `n-${resolution}`,
  kind: "event_start",
  payload: {
    end: "2026-10-06T11:00:00.000Z",
    eventKey: calendarEventKey(seminar),
    start: seminar.startAt,
    title: seminar.title,
  },
  readAt: null,
  resolution,
  resolvedAt: "2026-10-06T10:05:00.000Z",
});

/** Day open with the pool already fetched as given; the skip route waits for the test. */
const withPool = async (items: readonly PoolNotification[]) => {
  const skip = heldRoute();
  const runtime = await createTestRuntime({
    routes: {
      "GET /api/notifications": () => ({ deliveries: {}, items, more: false }),
      "POST /api/calendar/skip": skip.route,
    },
  });
  await runtime.notifications.refresh();
  await renderScreen(<DayScreen />, runtime);
  return { runtime, skip };
};

/** The Seminar row's Skip, in Day's calendar list. */
const seminarSkip = async () =>
  within(await screen.findByLabelText("From your calendar")).getByRole("button", {
    name: "Skip",
  });

describe("Day and the notification pool", () => {
  it("skips an event everywhere from Day, as Now does: shown while it is sent, gone once accepted", async () => {
    const { skip } = await withPool([]);
    await fireEvent.press(await seminarSkip());
    await waitFor(() => {
      expect(skip.waiting()).toBe(1);
    });
    expect(skip.calls).toEqual([{ eventKey: calendarEventKey(seminar), from: "app" }]);
    expect(screen.getByText("Seminar")).toBeOnTheScreen();
    await act(async () => {
      skip.answer({ ok: true });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText("Seminar")).toBeNull();
    });
  });

  it("hides a skipped event once the server took it, without waiting for the phone to save it (bug-lessons 57)", async () => {
    const { skip } = await withPool([]);
    // The phone's own storage is slow to write (Android's keystore): the card must not wait.
    const saving = Promise.withResolvers<undefined>();
    mockDismissHold.current = saving.promise;
    try {
      await fireEvent.press(await seminarSkip());
      await waitFor(() => {
        expect(skip.waiting()).toBe(1);
      });
      await act(async () => {
        skip.answer({ ok: true });
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(mockDismissHold.waiting).toBe(1);
      });
      expect(screen.queryByText("Seminar")).toBeNull();
    } finally {
      mockDismissHold.current = null;
      saving.resolve(undefined);
    }
  });

  it("keeps an event whose skip did not go through, and says so", async () => {
    const { skip } = await withPool([]);
    await fireEvent.press(await seminarSkip());
    await waitFor(() => {
      expect(skip.waiting()).toBe(1);
    });
    await act(async () => {
      skip.refuse();
      await Promise.resolve();
    });
    expect(await screen.findByText(en("notifications.failedAction"))).toBeOnTheScreen();
    expect(screen.getByText("Seminar")).toBeOnTheScreen();
  });

  it("does not ask again about an event skipped on another channel", async () => {
    calendar.state.events = [
      ...calendar.state.events,
      {
        allDay: false,
        endDate: "2026-10-06T16:00:00.000Z",
        id: "ev-later",
        startDate: "2026-10-06T15:00:00.000Z",
        title: "Evening lecture",
      },
    ];
    await withPool([answeredElsewhere("skipped")]);
    const list = await screen.findByLabelText("From your calendar");
    expect(within(list).getByText("Evening lecture")).toBeOnTheScreen();
    expect(within(list).queryByText("Seminar")).toBeNull();
  });

  it("reads an event attended on another channel as logged, with nothing to answer", async () => {
    await withPool([answeredElsewhere("attended")]);
    const list = await screen.findByLabelText("From your calendar");
    expect(within(list).getByText("logged")).toBeOnTheScreen();
    expect(within(list).queryByRole("button", { name: "Skip" })).toBeNull();
  });
});
