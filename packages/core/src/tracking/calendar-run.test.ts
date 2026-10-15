import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseEvent } from "../events/event-schema.ts";
import { NOW } from "../testing.ts";
import { activityExpect, activityLabel, calendarAttend, isCalendarRun } from "./calendar-run.ts";
import { INITIAL_TIME_STATE } from "./model.ts";

const at = (minutes: number): string => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

/** A 90-minute lecture starting ten minutes after now. */
const lecture = { endAt: at(100), startAt: at(10), title: "Lecture" };

const run = (startIn: number, label = lecture.title) => ({ label, startAt: at(startIn) });

describe("an occurrence's own run", () => {
  it("is under its title, begun from fifteen minutes before its start until its end", () => {
    // Attended ten minutes early it runs from the tap: answered, though not on the event's time yet.
    expect(isCalendarRun(lecture, run(0))).toBe(true);
    expect(isCalendarRun(lecture, run(-5))).toBe(true);
    expect(isCalendarRun(lecture, run(40))).toBe(true);
    expect(isCalendarRun(lecture, run(-6))).toBe(false);
    expect(isCalendarRun(lecture, run(100))).toBe(false);
    expect(isCalendarRun(lecture, run(0, "Something else"))).toBe(false);
  });

  it("counts a run begun from fifteen minutes before the start, not sixteen", () => {
    const later = { endAt: at(130), startAt: at(30), title: "Lecture" };
    const begun = (minutes: number) => ({ label: "Lecture", startAt: at(30 + minutes) });
    expect(isCalendarRun(later, begun(-16))).toBe(false);
    for (const minutes of [-15, -11, -10, 0]) {
      expect(isCalendarRun(later, begun(minutes))).toBe(true);
    }
  });

  it("is not a run of the same title left open from yesterday, nor the one just before", () => {
    expect(isCalendarRun(lecture, run(-24 * 60))).toBe(false);
    // Back to back: the 08:40–10:10 lecture's run is not the 10:10 one's.
    expect(isCalendarRun(lecture, run(-80))).toBe(false);
  });

  it("matches a title longer than a label as the activity stores it", () => {
    const long = { ...lecture, title: `  Lecture ${"x".repeat(100)}` };
    const stored = activityLabel(long.title);
    expect(stored).toHaveLength(80);
    expect(isCalendarRun(long, run(0, stored))).toBe(true);
  });
});

/** The envelope the server stamps on what it writes. */
const stamped = (write: ReturnType<typeof calendarAttend>) =>
  parseEvent({
    ...write.body,
    deviceId: "server",
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    occurredAt: write.occurredAt,
    precision: "exact",
    recordedAt: NOW,
    source: "system",
  });

describe("attending as the server does", () => {
  it("writes an event the log accepts and that counts as the run, whatever the lengths", () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 200, min: 1 }),
        fc.integer({ max: 3000, min: 1 }),
        fc.integer({ max: 15, min: -2000 }),
        (titleLength, minutes, startIn) => {
          const event = {
            endAt: at(startIn + minutes),
            startAt: at(startIn),
            title: "T".repeat(titleLength),
          };
          const write = calendarAttend(INITIAL_TIME_STATE, event, { activityId: "a-1", now: NOW });
          expect(stamped(write).ok).toBe(true);
          const isStarted = write.body.type === "activity.started";
          const ownRun = { label: activityLabel(event.title), startAt: write.occurredAt };
          expect(!isStarted || isCalendarRun(event, ownRun)).toBe(true);
        },
      ),
    );
  });

  it("caps the Expect at a day and has none for nothing left", () => {
    expect(activityExpect(3000)).toBe(24 * 60);
    expect(activityExpect(0.2)).toBeNull();
    expect(activityExpect(null)).toBeNull();
    expect(activityExpect(NaN)).toBeNull();
  });
});
