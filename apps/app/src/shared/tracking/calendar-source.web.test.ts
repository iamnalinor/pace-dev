import { noEventsKey } from "./calendar-source.web.ts";

describe("the Calendar picker with nothing on, in a browser (QA round 19 L6)", () => {
  it("says only that nothing is on: no phone calendar to set up, no Android settings", () => {
    expect(noEventsKey({ access: "granted", events: [] })).toBe("time.calendarNone");
    expect(noEventsKey(null)).toBe("time.calendarNone");
  });
});
