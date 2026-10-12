import { addMinutesIso } from "@pace/core";

import { promptedEvent } from "./calendar-today.ts";

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
