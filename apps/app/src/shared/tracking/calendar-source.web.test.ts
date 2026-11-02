import { type ApiClient, REQUEST_DEADLINE_MS } from "@pace/client";

import { calendarToday, noEventsKey } from "./calendar-source.web.ts";

describe("the Calendar picker with nothing on, in a browser (QA round 19 L6)", () => {
  it("says only that nothing is on: no phone calendar to set up, no Android settings", () => {
    expect(noEventsKey({ access: "granted", events: [] })).toBe("time.calendarNone");
    expect(noEventsKey(null)).toBe("time.calendarNone");
  });
});

describe("today's calendar in a browser (QA round 20 L9)", () => {
  it("asks the server once when the time bar and the prompt read it together", async () => {
    const asked: unknown[] = [];
    const answer = Promise.withResolvers<{ readonly events: readonly never[] }>();
    const api = {
      call: async (_endpoint: unknown, input: unknown) => {
        asked.push(input);
        return await answer.promise;
      },
      currentSessionToken: () => "session-a",
    } as unknown as ApiClient;
    const now = "2026-10-12T19:40:00.000Z";
    const both = Promise.all([
      calendarToday({ api, now, zone: "UTC" }),
      calendarToday({ api, now: "2026-10-12T19:41:07.000Z", zone: "UTC" }),
    ]);
    answer.resolve({ events: [] });
    await expect(both).resolves.toEqual([
      { access: "granted", events: [] },
      { access: "granted", events: [] },
    ]);
    expect(asked).toHaveLength(1);
    // Once answered, a later read asks again.
    await calendarToday({ api, now, zone: "UTC" });
    expect(asked).toHaveLength(2);
  });
});

describe("today's calendar request in a browser that never answers (round 7 review 5)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("gives up at the deadline, so the next read asks again instead of joining it for good", async () => {
    jest.useFakeTimers();
    const asked: unknown[] = [];
    const api = {
      call: async (_endpoint: unknown, input: unknown) => {
        asked.push(input);
        return asked.length === 1 ? await new Promise<never>(() => undefined) : { events: [] };
      },
      currentSessionToken: () => "session-a",
    } as unknown as ApiClient;
    const now = "2026-10-12T19:40:00.000Z";
    const stalled = calendarToday({ api, now, zone: "UTC" });
    await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
    await expect(stalled).resolves.toEqual({ access: "granted", events: [] });
    await expect(calendarToday({ api, now, zone: "UTC" })).resolves.toEqual({
      access: "granted",
      events: [],
    });
    expect(asked).toHaveLength(2);
  });

  it("never shares one session's request with another session's read", async () => {
    const asked: string[] = [];
    const session = { token: "session-a" };
    const answer = Promise.withResolvers<{ readonly events: readonly never[] }>();
    const api = {
      call: async () => {
        asked.push(session.token);
        return await answer.promise;
      },
      currentSessionToken: () => session.token,
    } as unknown as ApiClient;
    const now = "2026-10-12T19:40:00.000Z";
    const first = calendarToday({ api, now, zone: "UTC" });
    // Signed out and in as someone else while the first request is on its way.
    session.token = "session-b";
    const second = calendarToday({ api, now, zone: "UTC" });
    answer.resolve({ events: [] });
    await Promise.all([first, second]);
    expect(asked).toEqual(["session-a", "session-b"]);
  });
});
