import * as Calendar from "expo-calendar";
import * as SecureStore from "expo-secure-store";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { createTestRuntime } from "#app/test/runtime.ts";
import { FAKE_OWNER, type FakeCalendar } from "#app/testing/calendar.fake.ts";
import { endpoints } from "@pace/core";

import type { loadDeviceId as actualLoadDeviceId } from "./device-id.ts";
import type { calendarEvents as actualCalendarEvents } from "./phone-calendar.ts";

import { setCalendarSync } from "./phone-memory.ts";
import { clearPhoneCalendar, uploadPhoneData } from "./phone-upload.ts";

const at = (hhmm: string): number => Date.parse(`2026-10-06T${hhmm}:00.000Z`);

type UsageEvent = {
  readonly className: null;
  readonly eventType: number;
  readonly packageName: string;
  readonly timestamp: number;
};

/** Telegram in front 09:00–09:20 and Chrome from 09:40 on (still open). */
const MORNING: readonly UsageEvent[] = [
  { className: null, eventType: 15, packageName: "android", timestamp: at("09:00") },
  { className: null, eventType: 1, packageName: "org.telegram.messenger", timestamp: at("09:00") },
  { className: null, eventType: 2, packageName: "org.telegram.messenger", timestamp: at("09:20") },
  { className: null, eventType: 1, packageName: "com.android.chrome", timestamp: at("09:40") },
];

const TELEGRAM = "org.telegram.messenger";
const CLOCK = "com.google.android.deskclock";

const happened = (hhmm: string, eventType: number, packageName = "android"): UsageEvent => ({
  className: null,
  eventType,
  packageName,
  timestamp: at(hhmm),
});

/**
A night: Telegram in bed until the phone is locked at 01:21, the alarm rings over the lock screen
at 06:30 (shown, never unlocked), then the phone is unlocked at 07:10 for Telegram.
*/
const NIGHT: readonly UsageEvent[] = [
  happened("01:00", 15),
  happened("01:00", 18),
  happened("01:01", 1, TELEGRAM),
  happened("01:20", 2, TELEGRAM),
  happened("01:21", 17),
  happened("01:21", 16),
  happened("06:30", 15),
  happened("06:30", 1, CLOCK),
  happened("06:35", 2, CLOCK),
  happened("06:35", 16),
  happened("07:10", 15),
  happened("07:10", 18),
  happened("07:11", 1, TELEGRAM),
  happened("07:20", 2, TELEGRAM),
  happened("07:21", 16),
];

/** What the phone recorded; the read returns what falls in the range it asks for. */
const mockPhone = { events: MORNING };
const mockUsageRead = {
  gate: null as null | Promise<boolean>,
  started: null as (() => void) | null,
};
const mockCalendarRead = {
  gate: null as null | Promise<boolean>,
  started: null as (() => void) | null,
};
const mockDeviceRead = {
  gate: null as null | Promise<boolean>,
  started: null as (() => void) | null,
};

jest.mock("./device-id.ts", () => {
  const actual = jest.requireActual<{ readonly loadDeviceId: typeof actualLoadDeviceId }>(
    "./device-id.ts",
  );
  return {
    ...actual,
    loadDeviceId: async () => {
      mockDeviceRead.started?.();
      await mockDeviceRead.gate;
      return await actual.loadDeviceId();
    },
  };
});

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
        packages.map((name) => [
          name,
          { "com.google.android.deskclock": "Clock", "org.telegram.messenger": "Telegram" }[name] ??
            "Chrome",
        ]),
      ),
    hasUsageAccess: () => true,
    openUsageAccessSettings: jest.fn(),
    queryUsageEvents: async (from: number, to: number) => {
      mockUsageRead.started?.();
      await mockUsageRead.gate;
      return mockPhone.events.filter((event) => event.timestamp >= from && event.timestamp <= to);
    },
  },
}));

const calendar = Calendar as unknown as FakeCalendar;

type Sent = { readonly url: string; readonly body: Record<string, unknown> };

const world = async (
  sent: Sent[],
  calendarSync?: (body: Record<string, unknown>) => Promise<void>,
) => {
  const runtime = await createTestRuntime({
    now: "2026-10-06T10:00:00.000Z",
    routes: {
      "POST /api/calendar/sync": async ({ body }) => {
        await calendarSync?.(body as Record<string, unknown>);
        sent.push({ body: body as Record<string, unknown>, url: "calendar" });
        return { stored: 1 };
      },
      "DELETE /api/calendar": () => {
        sent.push({ body: {}, url: "clear" });
        return { ok: true };
      },
      "POST /api/usage/sessions": ({ body }) => {
        // What the Worker accepts: the endpoint's own strict input.
        const valid = endpoints.usage.upload.body.parse(body);
        sent.push({ body: valid, url: "usage" });
        return { stored: 2 };
      },
    },
  });
  await runtime.auth.adoptToken("session-A");
  return runtime;
};

beforeEach(async () => {
  mockPhone.events = MORNING;
  (SecureStore as unknown as FakeSecureStore).values.clear();
  mockUsageRead.gate = null;
  mockUsageRead.started = null;
  mockCalendarRead.gate = null;
  mockCalendarRead.started = null;
  mockDeviceRead.gate = null;
  mockDeviceRead.started = null;
  await SecureStore.setItemAsync("pace.session", "session-A");
  await setCalendarSync("session-A", true, () => true);
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
    await setCalendarSync("session-A", false, () => true);
    const sent: Sent[] = [];
    await uploadPhoneData((await world(sent)).api, "2026-10-06T10:00:00.000Z");
    expect(sent.map((item) => item.url)).toEqual(["usage"]);
  });

  it("does not inherit another session's calendar upload choice", async () => {
    const sent: Sent[] = [];
    const runtime = await world(sent);
    await setCalendarSync("session-A", true, () => true);
    await uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    expect(sent.some((item) => item.url === "calendar")).toBe(true);
    sent.length = 0;
    await runtime.auth.adoptToken("session-B");
    await uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    expect(sent.some((item) => item.url === "calendar")).toBe(false);
  });

  it("does not restore a calendar copy after upload was turned off during a read", async () => {
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
    await setCalendarSync("session-A", false, () => true);
    gate.resolve(true);
    await pending;
    expect(sent.some((item) => item.url === "calendar")).toBe(false);
  });

  it("clears after an already started calendar upload finishes", async () => {
    const sent: Sent[] = [];
    const started = Promise.withResolvers<boolean>();
    const gate = Promise.withResolvers<boolean>();
    const runtime = await world(sent, async () => {
      started.resolve(true);
      await gate.promise;
    });
    const upload = uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    await started.promise;
    await setCalendarSync("session-A", false, () => true);
    const clear = clearPhoneCalendar(runtime.api, "session-A");
    gate.resolve(true);
    await Promise.all([upload, clear]);
    expect(sent.map((item) => item.url)).toEqual(["calendar", "clear", "usage"]);
  });

  it("does not clear B's calendar when A signs out while the device id is loading", async () => {
    const sent: Sent[] = [];
    const runtime = await world(sent);
    const started = Promise.withResolvers<boolean>();
    const gate = Promise.withResolvers<boolean>();
    mockDeviceRead.started = () => {
      started.resolve(true);
    };
    mockDeviceRead.gate = gate.promise;
    try {
      const clear = clearPhoneCalendar(runtime.api, "session-A");
      await started.promise;
      await runtime.auth.adoptToken("session-B");
      gate.resolve(true);
      await clear;
      expect(sent.some((item) => item.url === "clear")).toBe(false);
    } finally {
      gate.resolve(true);
    }
  });
});

const usageSent = (sent: readonly Sent[]): readonly Record<string, unknown>[] =>
  sent.filter((item) => item.url === "usage").map((item) => item.body);

const use = (from: string, to: string) => ({
  endAt: `2026-10-06T${to}:00.000Z`,
  startAt: `2026-10-06T${from}:00.000Z`,
});

describe("what the phone tells about its use, for sleep on the server", () => {
  it("sends when the phone was really in use and how far it read", async () => {
    mockPhone.events = NIGHT;
    const sent: Sent[] = [];
    await uploadPhoneData((await world(sent)).api, "2026-10-06T10:00:00.000Z");
    const [body] = usageSent(sent);
    expect(body?.["uses"]).toEqual([
      use("01:00", "01:21"),
      use("01:01", "01:20"),
      use("07:10", "07:21"),
      use("07:11", "07:20"),
    ]);
    expect(body?.["until"]).toBe("2026-10-06T10:00:00.000Z");
    // The apps in front are still sent as they were, the alarm among them.
    expect(body?.["sessions"]).toEqual([
      { app: "Telegram", ...use("01:01", "01:20") },
      { app: "Clock", ...use("06:30", "06:35") },
      { app: "Telegram", ...use("07:11", "07:20") },
    ]);
  });

  it("never counts the alarm over the lock screen as use, also in a later upload", async () => {
    mockPhone.events = NIGHT;
    const sent: Sent[] = [];
    const runtime = await world(sent);
    await uploadPhoneData(runtime.api, "2026-10-06T01:30:00.000Z");
    await uploadPhoneData(runtime.api, "2026-10-06T06:40:00.000Z");
    const [, later] = usageSent(sent);
    // The next read starts at the last use, so the lock that followed it is read again.
    expect(later?.["uses"]).toEqual([use("01:00", "01:21"), use("01:01", "01:20")]);
    expect(later?.["until"]).toBe("2026-10-06T06:40:00.000Z");
    expect(later?.["sessions"]).toEqual([
      { app: "Telegram", ...use("01:01", "01:20") },
      { app: "Clock", ...use("06:30", "06:35") },
    ]);
  });

  it("reads next from the earliest start of the last app session and the last use", async () => {
    mockPhone.events = NIGHT;
    const sent: Sent[] = [];
    const runtime = await world(sent);
    await uploadPhoneData(runtime.api, "2026-10-06T10:00:00.000Z");
    await uploadPhoneData(runtime.api, "2026-10-06T10:30:00.000Z");
    const [, next] = usageSent(sent);
    // The unlocked spell from 07:10 ends last: it starts before Telegram's 07:11.
    expect(next?.["uses"]).toEqual([use("07:10", "07:21"), use("07:11", "07:20")]);
    expect(next?.["sessions"]).toEqual([{ app: "Telegram", ...use("07:11", "07:20") }]);
    expect(next?.["until"]).toBe("2026-10-06T10:30:00.000Z");
  });

  it("tells how far it read when the phone was not used at all", async () => {
    mockPhone.events = [];
    const sent: Sent[] = [];
    await uploadPhoneData((await world(sent)).api, "2026-10-06T10:00:00.000Z");
    const [body, ...more] = usageSent(sent);
    expect(more).toEqual([]);
    expect(body).toMatchObject({ sessions: [], until: "2026-10-06T10:00:00.000Z", uses: [] });
  });

  it("says how far it read only with the last batch", async () => {
    // 1001 Telegram minutes back to back from 15:00 the day before.
    const start = Date.parse("2026-10-05T15:00:00.000Z");
    mockPhone.events = Array.from({ length: 1001 }, (_, index) => [
      { className: null, eventType: 1, packageName: TELEGRAM, timestamp: start + index * 60_000 },
      {
        className: null,
        eventType: 2,
        packageName: TELEGRAM,
        timestamp: start + (index + 1) * 60_000,
      },
    ]).flat();
    const sent: Sent[] = [];
    await uploadPhoneData((await world(sent)).api, "2026-10-06T10:00:00.000Z");
    const [first, last] = usageSent(sent);
    expect(usageSent(sent)).toHaveLength(2);
    expect(first?.["sessions"]).toHaveLength(1000);
    expect(first?.["uses"]).toHaveLength(1000);
    expect(first).not.toHaveProperty("until");
    expect(last?.["sessions"]).toHaveLength(1);
    expect(last?.["uses"]).toHaveLength(1);
    expect(last?.["until"]).toBe("2026-10-06T10:00:00.000Z");
  });
});
