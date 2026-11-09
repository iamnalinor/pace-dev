import { describe, expect, it, vi } from "vitest";

import { type Event, type EventInput, newId, parseEvent, retiredAutoMissRevokes } from "@pace/core";

import { stampSystem, withRetiredMisses } from "./system-events.ts";

const NOW = "2026-10-06T10:00:00.000Z";

const parsed = (value: unknown): Event => {
  const result = parseEvent(value);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

/** The automatic miss an older client still writes at a task's final deadline (feedback 5). */
const oldMiss = (taskId: string): Event =>
  parsed({
    deviceId: "dev-old",
    id: `auto:${taskId}:missed`,
    occurredAt: "2026-10-06T09:30:00.000Z",
    payload: { outcome: "cancelled_missed", taskId },
    precision: "exact",
    recordedAt: "2026-10-06T09:30:01.000Z",
    source: "system",
    type: "task.closed",
  });

const reopened = (taskId: string): Event =>
  parsed({
    deviceId: "dev-1",
    id: newId(),
    occurredAt: "2026-10-06T09:40:00.000Z",
    payload: { taskId },
    precision: "exact",
    recordedAt: "2026-10-06T09:40:01.000Z",
    source: "app",
    type: "task.reopened",
  });

describe("stampSystem", () => {
  it("answers the reason, not a throw, when one of a group does not parse", () => {
    const broken: EventInput = {
      occurredAt: "not an instant",
      payload: { taskId: "t" },
      precision: "exact",
      source: "system",
      type: "task.reopened",
    };
    const result = stampSystem([broken], NOW);
    expect(result.ok).toBe(false);
  });
});

describe("withRetiredMisses", () => {
  it("leaves out a miss whose revoke does not parse, with it, and keeps the rest of the batch", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const [good, bad] = [oldMiss("good"), oldMiss("bad")];
    const other = reopened("x");
    const revokesOf: typeof retiredAutoMissRevokes = (events, now) =>
      retiredAutoMissRevokes(events, now).map((input) =>
        events.some((event) => event.id === bad.id) ? { ...input, occurredAt: "never" } : input,
      );
    const written = withRetiredMisses([good, bad, other], {
      known: new Set(),
      now: NOW,
      revokesOf,
    });
    expect(written.map((event) => event.id)).toEqual([good.id, other.id, `${good.id}:retired`]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("system/unparsable"));
  });

  it("writes every miss with its revoke when all parse", () => {
    const miss = oldMiss("t");
    const written = withRetiredMisses([miss], { known: new Set(), now: NOW });
    expect(written.map((event) => event.id)).toEqual([miss.id, `${miss.id}:retired`]);
  });
});
