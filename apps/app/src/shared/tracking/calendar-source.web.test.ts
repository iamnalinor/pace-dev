import type { ApiClient } from "@pace/client";

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
