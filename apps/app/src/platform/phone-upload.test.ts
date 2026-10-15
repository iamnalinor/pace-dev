import * as Calendar from "expo-calendar";
import * as SecureStore from "expo-secure-store";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { createTestRuntime } from "#app/test/runtime.ts";
import { FAKE_OWNER, type FakeCalendar } from "#app/testing/calendar.fake.ts";

import type { calendarEvents as actualCalendarEvents } from "./phone-calendar.ts";

import { setCalendarSync } from "./phone-memory.ts";
import { uploadPhoneData } from "./phone-upload.ts";

const at = (hhmm: string): number => Date.parse(`2026-10-06T${hhmm}:00.000Z`);

/** Telegram in front 09:00–09:20 and Chrome from 09:40 on (still open). */
const mockEvents = [
  { className: null, eventType: 15, packageName: "android", timestamp: at("09:00") },
  { className: null, eventType: 1, packageName: "org.telegram.messenger", timestamp: at("09:00") },
  { className: null, eventType: 2, packageName: "org.telegram.messenger", timestamp: at("09:20") },
  { className: null, eventType: 1, packageName: "com.android.chrome", timestamp: at("09:40") },
];
const mockUsageRead = {
  gate: null as null | Promise<boolean>,
  started: null as (() => void) | null,
};
const mockCalendarRead = {
  gate: null as null | Promise<boolean>,
  started: null as (() => void) | null,
};

jest.mock("./phone-calendar.ts", () => {
  const actual = jest.requireActual<{ readonly calendarEvents: typeof actualCalendarEvents }>(
    "./phone-calendar.ts",
  );
  return {
    ...actual,
    calendarEvents: async (from: string, to: string) => {
      if (mockCalendarRead.gate !== null) {
        mockCalendarRead.started?.();
        await mockCalendarRead.gate;
      }
      return await actual.calendarEvents(from, to);
    },
  };
});

jest.mock("../../modules/pace-native/index.ts", () => ({
  paceNative: {
    appLabels: async (packages: readonly string[]) =>
      Object.fromEntries(
        packages.map((name) => [name, name === "org.telegram.messenger" ? "Telegram" : "Chrome"]),
      ),
    hasUsageAccess: () => true,
    openUsageAccessSettings: jest.fn(),
    queryUsageEvents: async () => {
      mockUsageRead.started?.();
      await mockUsageRead.gate;
      return mockEvents;
    },
  },
}));

const calendar = Calendar as unknown as FakeCalendar;

type Sent = { readonly url: string; readonly body: Record<string, unknown> };

const world = async (sent: Sent[]) => {
  const runtime = await createTestRuntime({
    now: "2026-10-06T10:00:00.000Z",
    routes: {
      "POST /api/calendar/sync": ({ body }) => {
        sent.push({ body: body as Record<string, unknown>, url: "calendar" });
        return { stored: 1 };
      },
      "POST /api/usage/sessions": ({ body }) => {
        sent.push({ body: body as Record<string, unknown>, url: "usage" });
        return { stored: 2 };
      },
    },
  });
  await runtime.auth.adoptToken("session-A");
  return runtime;
};

beforeEach(async () => {
  (SecureStore as unknown as FakeSecureStore).values.clear();
  mockUsageRead.gate = null;
  mockUsageRead.started = null;
  mockCalendarRead.gate = null;
  mockCalendarRead.started = null;
  await SecureStore.setItemAsync("pace.session", "session-A");
  calendar.state.status = "granted";
  calendar.state.events = [
    {
      allDay: false,
      endDate: "2026-10-07T11:30:00.000Z",
      id: "ev-1",
      startDate: "2026-10-07T10:00:00.000Z",
      title: "Seminar",
    },
  ];
});

describe("what the phone sends to Pace", () => {
  it("does not send A's calendar after the session changes during its read", async () => {
    const sent: Sent[] = [];
    const runtime = await world(sent);
    const started = Promise.withResolvers<boolean>();
    const gate = Promise.withResolvers<boolean>();
    mockCalendarRead.started = () => {
      started.resolve(true);
    };
    mockCalendarRead.gate = gate.promise;
    const pending = uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    await started.promise;
    // Auth's in-memory token can change before SecureStore is written.
    await runtime.auth.adoptToken("session-B");
    gate.resolve(true);
    await pending;
    expect(sent.filter((item) => item.url === "calendar")).toEqual([]);
  });

  it("does not send an old session's usage to the newly signed-in account", async () => {
    const sent: Sent[] = [];
    const runtime = await world(sent);
    const started = Promise.withResolvers<boolean>();
    const gate = Promise.withResolvers<boolean>();
    mockUsageRead.started = () => {
      started.resolve(true);
    };
    mockUsageRead.gate = gate.promise;
    const pending = uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    await started.promise;
    await SecureStore.setItemAsync("pace.session", "session-B");
    await runtime.auth.adoptToken("session-B");
    gate.resolve(true);
    await pending;
    expect(sent.map((item) => item.url)).toEqual(["calendar"]);
    expect(await SecureStore.getItemAsync("pace.phone.usageCursor")).toBeNull();
  });

  it("starts usage history again for another signed-in session", async () => {
    const sent: Sent[] = [];
    const runtime = await world(sent);
    await uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    await SecureStore.setItemAsync("pace.session", "session-B");
    await runtime.auth.adoptToken("session-B");
    await uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    expect(
      sent.filter((item) => item.url === "usage").map((item) => item.body["sessions"]),
    ).toEqual([
      expect.arrayContaining([expect.objectContaining({ app: "Telegram" })]),
      expect.arrayContaining([expect.objectContaining({ app: "Telegram" })]),
    ]);
  });

  it("sends its calendar and the apps it had in front, by name, then only what is new", async () => {
    const sent: Sent[] = [];
    const runtime = await world(sent);
    await uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    expect(sent.map((item) => item.url)).toEqual(["calendar", "usage"]);
    expect(sent[0]?.body["events"]).toEqual([
      expect.objectContaining({ id: "ev-1", title: "Seminar" }),
    ]);
    expect(sent[1]?.body["sessions"]).toEqual([
      { app: "Telegram", endAt: "2026-10-06T09:20:00.000Z", startAt: "2026-10-06T09:00:00.000Z" },
      { app: "Chrome", endAt: "2026-10-06T10:00:00.000Z", startAt: "2026-10-06T09:40:00.000Z" },
    ]);
    // Next time only the session still open is sent again, grown.
    await uploadPhoneData(runtime.api, "2026-10-06T10:30:00.000Z");
    expect(sent.at(-1)?.body["sessions"]).toEqual([
      { app: "Chrome", endAt: "2026-10-06T10:30:00.000Z", startAt: "2026-10-06T09:40:00.000Z" },
    ]);
  });

  it("sends what the calendar tells about an event: place, notes, link, calendar and people", async () => {
    calendar.state.events = [
      {
        allDay: false,
        attendees: [
          { email: "ivanova@uni.example", name: "Prof. Ivanova", status: "accepted" },
          { email: FAKE_OWNER, status: "accepted" },
          { email: "petrov@uni.example", status: "tentative" },
        ],
        endDate: "2026-10-07T11:30:00.000Z",
        id: "ev-2",
        location: "  Room 214  ",
        notes: `Bring the sheet.\n${"x".repeat(2100)}`,
        organizerEmail: "ivanova@uni.example",
        startDate: "2026-10-07T10:00:00.000Z",
        title: "Algebra",
        url: "https://meet.google.com/abc-defg-hij",
      },
      // One's own event with nothing more to tell: only what it always had.
      {
        allDay: false,
        endDate: "2026-10-08T11:30:00.000Z",
        id: "ev-3",
        location: "",
        notes: "",
        recurrenceRule: null,
        startDate: "2026-10-08T10:00:00.000Z",
        title: "Gym",
      },
    ];
    const sent: Sent[] = [];
    await uploadPhoneData((await world(sent)).api, "2026-10-06T10:00:00.000Z");
    const [algebra, gym] = sent[0]?.body["events"] as Record<string, unknown>[];
    expect(algebra).toMatchObject({
      attendeeCount: 3,
      calendarName: "University",
      location: "Room 214",
      organizer: "Prof. Ivanova",
      url: "https://meet.google.com/abc-defg-hij",
    });
    expect(String(algebra?.["notes"])).toHaveLength(2000);
    expect(String(algebra?.["notes"])).toMatch(/^Bring the sheet\./u);
    expect(gym).toEqual({
      calendarName: "University",
      endAt: "2026-10-08T11:30:00.000Z",
      id: "ev-3",
      series: null,
      startAt: "2026-10-08T10:00:00.000Z",
      title: "Gym",
    });
  });

  it("keeps the calendar on the phone once sending it is turned off", async () => {
    await setCalendarSync(false);
    const sent: Sent[] = [];
    await uploadPhoneData((await world(sent)).api, "2026-10-06T10:00:00.000Z");
    expect(sent.map((item) => item.url)).toEqual(["usage"]);
  });
});
