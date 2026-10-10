import * as Calendar from "expo-calendar";
import * as SecureStore from "expo-secure-store";

import type { FakeCalendar } from "#app/testing/calendar.fake.ts";
import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { createTestRuntime } from "#app/test/runtime.ts";

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

jest.mock("../../modules/pace-native/index.ts", () => ({
  paceNative: {
    appLabels: async (packages: readonly string[]) =>
      Object.fromEntries(
        packages.map((name) => [name, name === "org.telegram.messenger" ? "Telegram" : "Chrome"]),
      ),
    hasUsageAccess: () => true,
    openUsageAccessSettings: jest.fn(),
    queryUsageEvents: async () => mockEvents,
  },
}));

const calendar = Calendar as unknown as FakeCalendar;

type Sent = { readonly url: string; readonly body: Record<string, unknown> };

const world = async (sent: Sent[]) =>
  await createTestRuntime({
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

beforeEach(() => {
  (SecureStore as unknown as FakeSecureStore).values.clear();
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

  it("keeps the calendar on the phone once sending it is turned off", async () => {
    await setCalendarSync(false);
    const sent: Sent[] = [];
    await uploadPhoneData((await world(sent)).api, "2026-10-06T10:00:00.000Z");
    expect(sent.map((item) => item.url)).toEqual(["usage"]);
  });
});
