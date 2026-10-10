import { describe, expect, it } from "vitest";

import type { Event } from "../events/event-schema.ts";

import { coreReducer, type CoreState, INITIAL_CORE_STATE } from "../materialize/core-state.ts";
import { materializeAt } from "../materialize/materializer.ts";
import { at } from "../materialize/task-fixture.fake.ts";
import { addMinutesIso } from "../time.ts";
import {
  evaluateNotifications,
  INITIAL_NOTIFY_MEMORY,
  nextAlarmAt,
  type NotifyMemory,
  snooze,
} from "./evaluate.ts";

const MOSCOW = "Europe/Moscow";
const SEEDED = "2026-10-01T06:00:00.000Z";
/** Wednesday October 7, 10:00 Moscow time: after the 09:00 digest, before the 14:00 one. */
const MORNING = "2026-10-07T07:00:00.000Z";
const NINE = "2026-10-07T06:00:00.000Z";
const TWO_PM = "2026-10-07T11:00:00.000Z";
/** Due Wednesday 20:00 Moscow: personal tasks turn critical 24 h before. */
const REPORT_DUE = "2026-10-07T17:00:00.000Z";
const REPORT_CREATED = "2026-10-05T07:00:00.000Z";

const base = (): readonly Event[] => [
  at(1, SEEDED, { type: "settings.updated", payload: { timezone: MOSCOW } }),
];

const report = (createdAt = REPORT_CREATED): Event =>
  at(2, createdAt, {
    type: "task.created",
    payload: {
      taskId: "t-report",
      title: "Write the report",
      presetId: "personal",
      importance: "normal",
      dueAt: REPORT_DUE,
      dueTz: MOSCOW,
      subtasks: [],
      fields: {},
    },
  });

const stateAt = (now: string, events: readonly Event[]): CoreState =>
  materializeAt([...base(), ...events], now, { reducer: coreReducer, initial: INITIAL_CORE_STATE });

const run = (now: string, events: readonly Event[], memory: NotifyMemory) =>
  evaluateNotifications(stateAt(now, events), { deviceTz: MOSCOW, now }, memory);

/** The memory of a check at `evaluatedAt` that saw nothing special. */
const checkedAt = (evaluatedAt: string, digestWindow: null | string = NINE): NotifyMemory => ({
  ...INITIAL_NOTIFY_MEMORY,
  digestWindow,
  evaluatedAt,
});

describe("critical alerts", () => {
  it("alerts once when the deadline rule starts to apply, and not again", () => {
    // 24 h before 20:00 Wednesday is 20:00 Tuesday; the last check was at 19:00, this one at 20:30.
    const tuesdayNight = "2026-10-06T17:30:00.000Z";
    const first = run(tuesdayNight, [report()], checkedAt("2026-10-06T16:00:00.000Z", null));
    expect(first.messages).toEqual([
      expect.objectContaining({ kind: "critical", taskId: "t-report" }),
    ]);
    expect(first.decisions[0]).toMatchObject({ outcome: "sent", rule: "critical" });
    const again = run(addMinutesIso(tuesdayNight, 30), [report()], first.memory);
    expect(again.messages.filter((message) => message.kind === "critical")).toEqual([]);
  });

  it("logs a crossing that a retro edit placed before the last check as suppressed", () => {
    // Created now but back-dated to Monday: it was already critical at the last check.
    const result = run(MORNING, [report()], checkedAt("2026-10-07T06:30:00.000Z"));
    expect(result.messages).toEqual([]);
    expect(result.decisions).toEqual([
      expect.objectContaining({
        outcome: "suppressed",
        rule: "critical",
        taskId: "t-report",
      }),
    ]);
    expect(result.memory.critical).toEqual(["t-report"]);
  });

  it("alerts for a task created after the last check, and stays silent in the quiet hours", () => {
    const fresh = run(
      MORNING,
      [report("2026-10-07T06:45:00.000Z")],
      checkedAt("2026-10-07T06:30:00.000Z"),
    );
    expect(fresh.messages.map((message) => message.kind)).toEqual(["critical"]);
    const night = "2026-10-06T21:00:00.000Z";
    const quiet = run(night, [report()], checkedAt("2026-10-06T16:00:00.000Z", null));
    expect(quiet).toMatchObject({ decisions: [], messages: [] });
    expect(quiet.memory.evaluatedAt).toBe("2026-10-06T16:00:00.000Z");
  });

  it("does not alert while the task is snoozed", () => {
    const memory = snooze(checkedAt("2026-10-06T16:00:00.000Z", null), "t-report", MORNING);
    expect(run("2026-10-06T17:30:00.000Z", [report()], memory).messages).toEqual([]);
  });
});

describe("digests", () => {
  it("sends the digest once per window with the top of Now", () => {
    const result = run(addMinutesIso(TWO_PM, 2), [report()], checkedAt(MORNING));
    const digest = result.messages.find((message) => message.kind === "digest");
    expect(digest).toMatchObject({
      inboxCount: 0,
      top: [expect.objectContaining({ taskId: "t-report", title: "Write the report" })],
      window: TWO_PM,
    });
    expect(result.memory.digestWindow).toBe(TWO_PM);
    const later = run(addMinutesIso(TWO_PM, 20), [report()], result.memory);
    expect(later.messages.filter((message) => message.kind === "digest")).toEqual([]);
  });

  it("skips an empty digest and a stale one, logging why", () => {
    const empty = run(addMinutesIso(TWO_PM, 1), [], checkedAt(MORNING));
    expect(empty.messages).toEqual([]);
    expect(empty.decisions).toEqual([
      expect.objectContaining({
        explanation: "Nothing to report.",
        outcome: "suppressed",
        rule: "digest",
      }),
    ]);
    const stale = run(addMinutesIso(TWO_PM, 120), [report()], checkedAt(MORNING));
    expect(stale.messages.filter((message) => message.kind === "digest")).toEqual([]);
    expect(stale.memory.digestWindow).toBe(TWO_PM);
  });

  it("reports a task in progress untouched longer than its preset allows with the digest, once", () => {
    const waiting = at(3, "2026-09-28T07:00:00.000Z", {
      type: "task.status.set",
      payload: { taskId: "t-report", status: "in_progress" },
    });
    const result = run(
      addMinutesIso(TWO_PM, 1),
      [report("2026-09-27T07:00:00.000Z"), waiting],
      checkedAt(MORNING),
    );
    expect(result.messages).toContainEqual(
      expect.objectContaining({ days: 9, kind: "stuck", taskId: "t-report" }),
    );
    const next = run(
      addMinutesIso(TWO_PM, 7 * 60),
      [report("2026-09-27T07:00:00.000Z"), waiting],
      result.memory,
    );
    expect(next.messages.filter((message) => message.kind === "stuck")).toEqual([]);
  });
});

describe("the next alarm", () => {
  it("is the earlier of the next window and the next deadline crossing", () => {
    const state = stateAt("2026-10-06T12:00:00.000Z", [report()]);
    const ctx = { deviceTz: MOSCOW, now: "2026-10-06T12:00:00.000Z" };
    // 15:00 Tuesday: the 21:00 window (18:00Z) comes after the crossing at 17:00Z.
    expect(nextAlarmAt(state, ctx, INITIAL_NOTIFY_MEMORY)).toBe("2026-10-06T17:00:00.000Z");
    const alerted = { ...INITIAL_NOTIFY_MEMORY, critical: ["t-report"] };
    expect(nextAlarmAt(state, ctx, alerted)).toBe("2026-10-06T18:00:00.000Z");
  });
});

describe("still doing this?", () => {
  const commute = at(3, MORNING, {
    type: "activity.started",
    payload: { activityId: "a-commute", category: "commute", expectMinutes: 30, label: "Commute" },
  });

  it("asks once when the running activity takes twice its Expect, and arms for it", () => {
    const before = addMinutesIso(MORNING, 30);
    expect(
      nextAlarmAt(stateAt(before, [commute]), { deviceTz: MOSCOW, now: before }, checkedAt(before)),
    ).toBe(addMinutesIso(MORNING, 60));
    const after = addMinutesIso(MORNING, 61);
    const first = run(after, [commute], checkedAt(before));
    expect(first.messages).toEqual([
      expect.objectContaining({
        activityId: "a-commute",
        expectMinutes: 30,
        kind: "long",
        label: "Commute",
      }),
    ]);
    expect(first.decisions.map((entry) => `${entry.rule}:${entry.outcome}`)).toContain("long:sent");
    const again = run(addMinutesIso(MORNING, 70), [commute], first.memory);
    expect(again.messages.filter((message) => message.kind === "long")).toEqual([]);
  });

  it("asks again after a yes, at twice the new Expect", () => {
    const first = run(addMinutesIso(MORNING, 61), [commute], checkedAt(addMinutesIso(MORNING, 30)));
    const yes = at(4, addMinutesIso(MORNING, 62), {
      type: "activity.labelled",
      payload: { activityId: "a-commute", expectMinutes: 62 },
    });
    expect(
      run(addMinutesIso(MORNING, 100), [commute, yes], first.memory).messages.filter(
        (m) => m.kind === "long",
      ),
    ).toEqual([]);
    const later = run(addMinutesIso(MORNING, 125), [commute, yes], first.memory);
    expect(later.messages.filter((m) => m.kind === "long")).toEqual([
      expect.objectContaining({ expectMinutes: 62 }),
    ]);
  });

  it("says nothing once the activity stopped", () => {
    const stopped = at(4, addMinutesIso(MORNING, 40), {
      type: "activity.stopped",
      payload: { activityId: "a-commute" },
    });
    const later = addMinutesIso(MORNING, 90);
    expect(
      run(later, [commute, stopped], checkedAt(MORNING)).messages.filter((m) => m.kind === "long"),
    ).toEqual([]);
  });
});
