import { addMinutesIso } from "@pace/core";

import { calendarButtonState, isAttendableNow, promptedEvent } from "./calendar-today.ts";

const NOW = "2026-10-06T09:55:00.000Z";

/** A 90-minute event starting `startIn` minutes after now. */
const event = (id: string, startIn: number) => ({
  endAt: addMinutesIso(NOW, startIn + 90),
  id,
  series: null,
  startAt: addMinutesIso(NOW, startIn),
  title: `Event ${id}`,
});

const nothing = { activities: [], dismissed: new Set<string>(), ruled: new Set<string>() };

describe("the calendar event Now asks about", () => {
  it("is the one starting within ten minutes or going on, the earliest first", () => {
    expect(promptedEvent([event("later", 30), event("soon", 5)], NOW, nothing)?.id).toBe("soon");
    expect(promptedEvent([event("on", -20)], NOW, nothing)?.id).toBe("on");
    expect(promptedEvent([event("far", 11)], NOW, nothing)).toBeNull();
    expect(promptedEvent([event("over", -100)], NOW, nothing)).toBeNull();
  });

  it("is never one skipped, answered for its series, or already being tracked", () => {
    const soon = event("soon", 5);
    expect(
      promptedEvent([soon], NOW, {
        ...nothing,
        dismissed: new Set([`calendar@soon@${soon.startAt}`]),
      }),
    ).toBeNull();
    expect(
      promptedEvent([{ ...soon, series: "cal:Algebra" }], NOW, {
        ...nothing,
        ruled: new Set(["cal:Algebra"]),
      }),
    ).toBeNull();
    expect(
      promptedEvent([soon], NOW, {
        ...nothing,
        activities: [{ endAt: null, label: "Event soon", startAt: addMinutesIso(NOW, -1) }],
      }),
    ).toBeNull();
  });
});

const today = (events: readonly ReturnType<typeof event>[]) => ({
  access: "granted" as const,
  events,
});

describe("what the Calendar button can do now", () => {
  it("waits for the calendar, and says when there is no access", () => {
    expect(calendarButtonState(null, NOW)).toEqual({ kind: "loading" });
    expect(calendarButtonState({ access: "denied", events: [] }, NOW)).toEqual({
      kind: "noAccess",
    });
  });

  it("links to events within 15 minutes of now: soon, going on, just over", () => {
    const soon = event("soon", 15);
    const on = event("on", -30);
    const over = { ...event("over", -100), endAt: addMinutesIso(NOW, -10) };
    expect(calendarButtonState(today([soon, on, over]), NOW)).toEqual({
      events: [over, on, soon],
      kind: "ready",
    });
  });

  it("has nothing to link to further away", () => {
    const later = event("later", 16);
    const long = { ...event("long", -200), endAt: addMinutesIso(NOW, -16) };
    expect(calendarButtonState(today([later, long]), NOW)).toEqual({ kind: "nothingNear" });
  });
});

describe("when an event can be attended", () => {
  it.each([-10, -0.02, 0, 0.02, 2, 15])("is so for an event starting in %s minutes", (startIn) => {
    expect(isAttendableNow(event("e", startIn), NOW)).toBe(true);
  });

  it.each([15.02, 16, 120])("is not for an event starting in %s minutes", (startIn) => {
    expect(isAttendableNow(event("e", startIn), NOW)).toBe(false);
  });
});
