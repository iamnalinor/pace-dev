import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { PresetDefinition, Recurrence, Weekday } from "../model/preset.ts";

import { EventIdSchema, type EventInput, parseEvent } from "../events/event-schema.ts";
import { instanceId } from "../ids.ts";
import { materialize } from "../materialize/materializer.ts";
import { event } from "../materialize/task-fixture.fake.ts";
import { taskReducer } from "../materialize/task-reducer.ts";
import { INITIAL_TASKS_STATE, type TasksState } from "../model/task.ts";
import { exampleCoursePresetEvents } from "../presets/example-presets.ts";
import {
  INITIAL_PRESETS_STATE,
  presetReducer,
  type PresetsState,
} from "../presets/preset-reducer.ts";
import { dueWeekOffset } from "../presets/recurrence.ts";
import { formatInZone, isoWeekKey } from "../time.ts";
import {
  expectedInstances,
  type InstanceSlot,
  instanceWeekOf,
  missingInstanceEvents,
} from "./hw-instances.ts";

const SEEDED_AT = "2026-09-01T09:00:00.000Z";
const MOSCOW = "Europe/Moscow";
const BERLIN = "Europe/Berlin";
const NEW_YORK = "America/New_York";

const weekly = (
  issued: readonly [Weekday, string],
  due: readonly [Weekday, string],
  zone: string,
): Recurrence => ({
  issued: { weekday: issued[0], time: issued[1] },
  due: { weekday: due[0], time: due[1] },
  tz: zone,
});

const presetCreated = (id: string, name: string, definition: PresetDefinition): EventInput => ({
  type: "preset.created",
  occurredAt: SEEDED_AT,
  precision: "exact",
  source: "web",
  payload: { id, name, extends: "hw", definition },
});

const presetArchived = (id: string): EventInput => ({
  type: "preset.archived",
  occurredAt: SEEDED_AT,
  precision: "exact",
  source: "web",
  payload: { id },
});

const withEnvelope = (inputs: readonly EventInput[]) =>
  inputs.map((input, index) => event(index + 1, input));

const foldPresets = (inputs: readonly EventInput[]): PresetsState =>
  materialize(withEnvelope(inputs), presetReducer, INITIAL_PRESETS_STATE);

const foldTasks = (inputs: readonly EventInput[]): TasksState =>
  materialize(withEnvelope(inputs), taskReducer, INITIAL_TASKS_STATE);

/** The three seeded courses: Algebra Mon 10:00 → Wed 23:59, Calculus Tue → next Mon, History Thu → next Thu. */
const EXAMPLES = foldPresets(exampleCoursePresetEvents(SEEDED_AT));

const BERLIN_PRESETS = foldPresets([
  presetCreated("hw.berlin", "Berlin HW", {
    recurrence: weekly([1, "10:00"], [5, "18:00"], BERLIN),
  }),
  // Issued at the same instant as Berlin HW: ties are ordered by preset id.
  presetCreated("hw.aachen", "Aachen HW", {
    recurrence: weekly([1, "10:00"], [3, "12:00"], BERLIN),
  }),
  // Due the Monday after a Thursday issue: the slot pair straddles the autumn change.
  presetCreated("hw.berlin-span", "Berlin span HW", {
    recurrence: weekly([4, "09:00"], [1, "23:59"], BERLIN),
  }),
]);

const NY_PRESETS = foldPresets([
  presetCreated("hw.ny", "NY HW", {
    defaultEstimateMinutes: 45,
    recurrence: weekly([1, "09:00"], [7, "23:00"], NEW_YORK),
  }),
]);

const slotOf = (
  slots: readonly InstanceSlot[],
  presetId: string,
  isoWeek: string,
): InstanceSlot | undefined =>
  slots.find((slot) => slot.presetId === presetId && slot.isoWeek === isoWeek);

const instanceCreated = (
  presetId: string,
  isoWeek: string,
  payload: { readonly estimateMinutes?: number; readonly title?: string } = {},
): EventInput => ({
  id: instanceId(presetId, isoWeek),
  type: "task.created",
  occurredAt: SEEDED_AT,
  precision: "exact",
  source: "system",
  payload: {
    taskId: instanceId(presetId, isoWeek),
    title: payload.title ?? "earlier",
    presetId,
    ...(payload.estimateMinutes !== undefined && { estimateMinutes: payload.estimateMinutes }),
    subtasks: [],
    fields: {},
  },
});

/** Tuesday 2026-10-06 15:00 Moscow: ISO week 41. */
const TUESDAY_W41 = "2026-10-06T12:00:00.000Z";

describe("expectedInstances", () => {
  it("lists the current and the next ISO week for every recurring preset, issued first", () => {
    const slots = expectedInstances(EXAMPLES, TUESDAY_W41);

    expect(slots).toEqual([
      {
        presetId: "hw.algebra",
        isoWeek: "2026-W41",
        issuedAt: "2026-10-05T07:00:00.000Z",
        dueAt: "2026-10-07T20:59:00.000Z",
        dueTz: MOSCOW,
      },
      {
        presetId: "hw.calculus",
        isoWeek: "2026-W41",
        issuedAt: "2026-10-06T09:00:00.000Z",
        // Due Monday 23:59: the slot before the issue weekday falls in the following week.
        dueAt: "2026-10-12T20:59:00.000Z",
        dueTz: MOSCOW,
      },
      {
        presetId: "hw.history",
        isoWeek: "2026-W41",
        issuedAt: "2026-10-08T06:00:00.000Z",
        // The same slot as the issue is due one week later.
        dueAt: "2026-10-15T06:00:00.000Z",
        dueTz: MOSCOW,
      },
      {
        presetId: "hw.algebra",
        isoWeek: "2026-W42",
        issuedAt: "2026-10-12T07:00:00.000Z",
        dueAt: "2026-10-14T20:59:00.000Z",
        dueTz: MOSCOW,
      },
      {
        presetId: "hw.calculus",
        isoWeek: "2026-W42",
        issuedAt: "2026-10-13T09:00:00.000Z",
        dueAt: "2026-10-19T20:59:00.000Z",
        dueTz: MOSCOW,
      },
      {
        presetId: "hw.history",
        isoWeek: "2026-W42",
        issuedAt: "2026-10-15T06:00:00.000Z",
        dueAt: "2026-10-22T06:00:00.000Z",
        dueTz: MOSCOW,
      },
    ]);
  });

  it("ignores the built-ins and presets without a recurrence", () => {
    const presets = foldPresets([presetCreated("hw.plain", "Plain HW", {})]);

    expect(expectedInstances(INITIAL_PRESETS_STATE, TUESDAY_W41)).toEqual([]);
    expect(expectedInstances(presets, TUESDAY_W41)).toEqual([]);
  });

  it("ignores archived presets and presets whose chain does not resolve", () => {
    const presets = foldPresets([
      ...exampleCoursePresetEvents(SEEDED_AT),
      presetArchived("hw.history"),
      // Stored by the reducer as given; the chain breaks at the unknown parent.
      {
        type: "preset.created",
        occurredAt: SEEDED_AT,
        precision: "exact",
        source: "web",
        payload: {
          id: "hw.orphan",
          name: "Orphan HW",
          extends: "hw.missing",
          definition: { recurrence: weekly([1, "10:00"], [5, "18:00"], MOSCOW) },
        },
      },
    ]);

    const slots = expectedInstances(presets, TUESDAY_W41);

    expect(slots.map((slot) => slot.presetId)).toEqual([
      "hw.algebra",
      "hw.calculus",
      "hw.algebra",
      "hw.calculus",
    ]);
  });

  it("keeps the wall clock of the schedule when Berlin leaves summer time", () => {
    // Tuesday 2026-10-20 (W43); CEST ends on Sunday 2026-10-25 at 03:00.
    const slots = expectedInstances(BERLIN_PRESETS, "2026-10-20T10:00:00.000Z");

    expect(slots.map((slot) => `${slot.presetId} ${slot.isoWeek}`)).toEqual([
      "hw.aachen 2026-W43",
      "hw.berlin 2026-W43",
      "hw.berlin-span 2026-W43",
      "hw.aachen 2026-W44",
      "hw.berlin 2026-W44",
      "hw.berlin-span 2026-W44",
    ]);
    expect(slotOf(slots, "hw.berlin", "2026-W43")).toEqual({
      presetId: "hw.berlin",
      isoWeek: "2026-W43",
      issuedAt: "2026-10-19T08:00:00.000Z",
      dueAt: "2026-10-23T16:00:00.000Z",
      dueTz: BERLIN,
    });
    expect(slotOf(slots, "hw.berlin", "2026-W44")).toEqual({
      presetId: "hw.berlin",
      isoWeek: "2026-W44",
      issuedAt: "2026-10-26T09:00:00.000Z",
      dueAt: "2026-10-30T17:00:00.000Z",
      dueTz: BERLIN,
    });
    // Issued before the change, due after it: 23:59 CET is 22:59Z, not 21:59Z.
    expect(slotOf(slots, "hw.berlin-span", "2026-W43")).toEqual({
      presetId: "hw.berlin-span",
      isoWeek: "2026-W43",
      issuedAt: "2026-10-22T07:00:00.000Z",
      dueAt: "2026-10-26T22:59:00.000Z",
      dueTz: BERLIN,
    });
    expect(slotOf(slots, "hw.berlin-span", "2026-W44")).toEqual({
      presetId: "hw.berlin-span",
      isoWeek: "2026-W44",
      issuedAt: "2026-10-29T08:00:00.000Z",
      dueAt: "2026-11-02T22:59:00.000Z",
      dueTz: BERLIN,
    });
  });

  it("keeps the wall clock of the schedule when Berlin enters summer time", () => {
    // Tuesday 2026-03-24 (W13); CEST starts on Sunday 2026-03-29 at 02:00.
    const slots = expectedInstances(BERLIN_PRESETS, "2026-03-24T12:00:00.000Z");

    expect(slotOf(slots, "hw.berlin", "2026-W13")).toMatchObject({
      issuedAt: "2026-03-23T09:00:00.000Z",
      dueAt: "2026-03-27T17:00:00.000Z",
    });
    expect(slotOf(slots, "hw.berlin", "2026-W14")).toMatchObject({
      issuedAt: "2026-03-30T08:00:00.000Z",
      dueAt: "2026-04-03T16:00:00.000Z",
    });
  });

  it("keeps the wall clock of the schedule when New York leaves summer time", () => {
    // Wednesday 2026-10-28 (W44); EDT ends on Sunday 2026-11-01 at 02:00.
    const slots = expectedInstances(NY_PRESETS, "2026-10-28T12:00:00.000Z");

    expect(slots).toEqual([
      {
        presetId: "hw.ny",
        isoWeek: "2026-W44",
        issuedAt: "2026-10-26T13:00:00.000Z",
        dueAt: "2026-11-02T04:00:00.000Z",
        dueTz: NEW_YORK,
      },
      {
        presetId: "hw.ny",
        isoWeek: "2026-W45",
        issuedAt: "2026-11-02T14:00:00.000Z",
        dueAt: "2026-11-09T04:00:00.000Z",
        dueTz: NEW_YORK,
      },
    ]);
  });

  it("crosses the year boundary from week 53 into week 1", () => {
    // Thursday 2026-12-31 lies in 2026-W53; the next week is 2027-W01.
    const slots = expectedInstances(EXAMPLES, "2026-12-31T12:00:00.000Z");

    expect(slots.map((slot) => slot.isoWeek)).toEqual([
      "2026-W53",
      "2026-W53",
      "2026-W53",
      "2027-W01",
      "2027-W01",
      "2027-W01",
    ]);
    expect(slotOf(slots, "hw.algebra", "2026-W53")).toMatchObject({
      issuedAt: "2026-12-28T07:00:00.000Z",
      dueAt: "2026-12-30T20:59:00.000Z",
    });
    expect(slotOf(slots, "hw.algebra", "2027-W01")).toMatchObject({
      issuedAt: "2027-01-04T07:00:00.000Z",
      dueAt: "2027-01-06T20:59:00.000Z",
    });
    // Calculus issued in 2026 is due on the first Monday of 2027.
    expect(slotOf(slots, "hw.calculus", "2026-W53")).toMatchObject({
      issuedAt: "2026-12-29T09:00:00.000Z",
      dueAt: "2027-01-04T20:59:00.000Z",
    });
  });

  it("reads the current week in the recurrence zone, not in UTC", () => {
    // Sunday 22:00Z: already Monday 01:00 in Moscow, still Sunday 18:00 in New York.
    const now = "2026-10-11T22:00:00.000Z";

    expect(expectedInstances(EXAMPLES, now).map((slot) => slot.isoWeek)).toEqual([
      "2026-W42",
      "2026-W42",
      "2026-W42",
      "2026-W43",
      "2026-W43",
      "2026-W43",
    ]);
    expect(expectedInstances(NY_PRESETS, now).map((slot) => slot.isoWeek)).toEqual([
      "2026-W41",
      "2026-W42",
    ]);
  });
});

describe("missingInstanceEvents", () => {
  it("creates the issued instances, and one ahead of its issue for a course with none open", () => {
    const events = missingInstanceEvents({
      tasks: INITIAL_TASKS_STATE,
      presets: EXAMPLES,
      now: TUESDAY_W41,
    });

    // History is issued on Thursday: it is put on the plan now, starting at its issue.
    expect(events).toEqual([
      {
        id: "hw:hw.algebra:2026-W41",
        type: "task.created",
        occurredAt: "2026-10-05T07:00:00.000Z",
        precision: "exact",
        source: "system",
        payload: {
          taskId: "hw:hw.algebra:2026-W41",
          title: "Algebra HW 1",
          presetId: "hw.algebra",
          dueAt: "2026-10-07T20:59:00.000Z",
          dueTz: MOSCOW,
          startAt: "2026-10-05T07:00:00.000Z",
          startTz: MOSCOW,
          estimateMinutes: 60,
          subtasks: [],
          fields: {},
        },
      },
      {
        id: "hw:hw.calculus:2026-W41",
        type: "task.created",
        occurredAt: "2026-10-06T09:00:00.000Z",
        precision: "exact",
        source: "system",
        payload: {
          taskId: "hw:hw.calculus:2026-W41",
          title: "Calculus HW 1",
          presetId: "hw.calculus",
          dueAt: "2026-10-12T20:59:00.000Z",
          dueTz: MOSCOW,
          startAt: "2026-10-06T09:00:00.000Z",
          startTz: MOSCOW,
          estimateMinutes: 60,
          subtasks: [],
          fields: {},
        },
      },
      {
        id: "hw:hw.history:2026-W41",
        type: "task.created",
        occurredAt: "2026-10-01T06:00:00.000Z",
        precision: "exact",
        source: "system",
        payload: {
          taskId: "hw:hw.history:2026-W41",
          title: "History HW 1",
          presetId: "hw.history",
          dueAt: "2026-10-15T06:00:00.000Z",
          dueTz: MOSCOW,
          startAt: "2026-10-08T06:00:00.000Z",
          startTz: MOSCOW,
          estimateMinutes: 60,
          subtasks: [],
          fields: {},
        },
      },
    ]);
  });

  it("makes the first instance ahead of its issue, under the same id as at the issue", () => {
    // Algebra alone: issued Monday 10:00 Moscow.
    const presets = foldPresets(exampleCoursePresetEvents(SEEDED_AT).slice(0, 1));
    const before = missingInstanceEvents({
      tasks: INITIAL_TASKS_STATE,
      presets,
      now: "2026-10-05T06:59:59.000Z",
    });
    const atIssue = missingInstanceEvents({
      tasks: INITIAL_TASKS_STATE,
      presets,
      now: "2026-10-05T07:00:00.000Z",
    });

    expect(before.map((input) => input.id)).toEqual(["hw:hw.algebra:2026-W41"]);
    expect(atIssue.map((input) => input.id)).toEqual(["hw:hw.algebra:2026-W41"]);
    expect(
      missingInstanceEvents({ tasks: foldTasks(before), presets, now: "2026-10-05T07:00:00.000Z" }),
    ).toEqual([]);
  });

  it("makes the same instance ahead whenever, wherever it is derived", () => {
    const presets = foldPresets(exampleCoursePresetEvents(SEEDED_AT).slice(0, 1));
    const derive = (now: string) =>
      missingInstanceEvents({ tasks: INITIAL_TASKS_STATE, presets, now });
    const early = derive("2026-10-05T03:00:00.000Z");
    expect(early).toEqual(derive("2026-10-05T06:59:59.000Z"));
    // Recorded a week before its issue (never after now, never before the course).
    expect(early.map((input) => input.occurredAt)).toEqual(["2026-09-28T07:00:00.000Z"]);
  });

  it("puts the next week ahead when this week's instance was taken back", () => {
    const presets = foldPresets(exampleCoursePresetEvents(SEEDED_AT).slice(0, 1));
    const events = missingInstanceEvents({
      existingEventIds: new Set(["hw:hw.algebra:2026-W41"]),
      now: TUESDAY_W41,
      presets,
      tasks: INITIAL_TASKS_STATE,
    });
    expect(events.map((input) => input.id)).toEqual(["hw:hw.algebra:2026-W42"]);
  });

  it("skips a week whose deadline passed before the course was added; the next waits ahead", () => {
    // Algebra (Mon 10:00 → Wed 23:59) added on Saturday of week 41.
    const saturday = "2026-10-10T09:00:00.000Z";
    const presets = foldPresets(exampleCoursePresetEvents(saturday).slice(0, 1));

    const events = missingInstanceEvents({ tasks: INITIAL_TASKS_STATE, presets, now: saturday });

    expect(events.map((input) => [input.id, input.payload])).toMatchObject([
      ["hw:hw.algebra:2026-W42", { startAt: "2026-10-12T07:00:00.000Z", title: "Algebra HW 1" }],
    ]);
  });

  it("numbers the title after every existing instance of the preset, closed ones included", () => {
    const tasks = foldTasks([
      instanceCreated("hw.algebra", "2026-W39"),
      instanceCreated("hw.algebra", "2026-W40"),
      {
        type: "task.closed",
        occurredAt: SEEDED_AT,
        precision: "exact",
        source: "app",
        payload: { taskId: instanceId("hw.algebra", "2026-W39"), outcome: "done" },
      },
      instanceCreated("hw.calculus", "2026-W40"),
    ]);

    const events = missingInstanceEvents({ tasks, presets: EXAMPLES, now: TUESDAY_W41 });

    expect(events.map((input) => input.payload)).toMatchObject([
      { taskId: "hw:hw.algebra:2026-W41", title: "Algebra HW 3" },
      { taskId: "hw:hw.calculus:2026-W41", title: "Calculus HW 2" },
      { taskId: "hw:hw.history:2026-W41", title: "History HW 1" },
    ]);
  });

  it("inherits the estimate of the latest instance by week, whatever the event order", () => {
    const tasks = foldTasks([
      instanceCreated("hw.algebra", "2026-W40", { estimateMinutes: 90 }),
      instanceCreated("hw.algebra", "2026-W39", { estimateMinutes: 45 }),
    ]);

    const events = missingInstanceEvents({ tasks, presets: EXAMPLES, now: TUESDAY_W41 });

    expect(events.map((input) => input.payload)).toMatchObject([
      { taskId: "hw:hw.algebra:2026-W41", estimateMinutes: 90 },
      { taskId: "hw:hw.calculus:2026-W41", estimateMinutes: 60 },
      { taskId: "hw:hw.history:2026-W41" },
    ]);
  });

  it("falls back to the preset default when the latest instance has no estimate", () => {
    const algebra = foldTasks([
      instanceCreated("hw.algebra", "2026-W39", { estimateMinutes: 45 }),
      instanceCreated("hw.algebra", "2026-W40"),
    ]);
    const ny = missingInstanceEvents({
      tasks: INITIAL_TASKS_STATE,
      presets: NY_PRESETS,
      now: "2026-10-28T12:00:00.000Z",
    });

    expect(
      missingInstanceEvents({ tasks: algebra, presets: EXAMPLES, now: TUESDAY_W41 }).map(
        (input) => input.payload,
      ),
    ).toMatchObject([{ taskId: "hw:hw.algebra:2026-W41", estimateMinutes: 60 }, {}, {}]);
    expect(ny.map((input) => input.payload)).toMatchObject([
      { taskId: "hw:hw.ny:2026-W44", title: "NY HW 1", estimateMinutes: 45 },
    ]);
  });

  it("is idempotent once the first batch is applied", () => {
    const first = missingInstanceEvents({
      tasks: INITIAL_TASKS_STATE,
      presets: EXAMPLES,
      now: TUESDAY_W41,
    });
    const tasks = foldTasks(first);

    expect(first).toHaveLength(3);
    expect(missingInstanceEvents({ tasks, presets: EXAMPLES, now: TUESDAY_W41 })).toEqual([]);
    // The slots themselves are still expected: only the creation is skipped.
    expect(expectedInstances(EXAMPLES, TUESDAY_W41)).toHaveLength(6);
  });

  it("never creates instances for an archived preset", () => {
    const presets = foldPresets([
      ...exampleCoursePresetEvents(SEEDED_AT),
      presetArchived("hw.algebra"),
    ]);

    const events = missingInstanceEvents({ tasks: INITIAL_TASKS_STATE, presets, now: TUESDAY_W41 });

    expect(events.map((input) => input.id)).toEqual([
      "hw:hw.calculus:2026-W41",
      "hw:hw.history:2026-W41",
    ]);
  });

  it("generates valid events for any schedule, zone and instant (property)", () => {
    const weekdayArb = fc.constantFrom<Weekday>(1, 2, 3, 4, 5, 6, 7);
    // Hours from 03:00 on: 02:xx may not exist on the night summer time starts.
    const timeArb = fc
      .tuple(fc.integer({ min: 3, max: 23 }), fc.nat({ max: 59 }))
      .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    const slotArb = fc.tuple(weekdayArb, timeArb);
    const zoneArb = fc.constantFrom(MOSCOW, BERLIN, NEW_YORK, "UTC", "Asia/Kolkata");
    const nowArb = fc
      .date({
        min: new Date("2020-01-01T00:00:00Z"),
        max: new Date("2030-12-31T00:00:00Z"),
        noInvalidDate: true,
      })
      .map((date) => date.toISOString());

    const caseArb = fc.record({ issued: slotArb, due: slotArb, zone: zoneArb, now: nowArb });

    fc.assert(
      fc.property(caseArb, ({ issued, due, zone, now }) => {
        const recurrence = weekly(issued, due, zone);
        const presets = foldPresets([
          presetCreated("hw.prop", "Prop HW", { recurrence }),
          presetCreated("hw.plain", "Plain HW", {}),
        ]);

        const slots = expectedInstances(presets, now);
        const events = missingInstanceEvents({ tasks: INITIAL_TASKS_STATE, presets, now });

        const [current, next] = slots;
        expect(slots).toHaveLength(2);
        expect(current?.isoWeek).toBe(isoWeekKey(now, zone));
        for (const slot of slots) {
          expect(isoWeekKey(slot.issuedAt, zone)).toBe(slot.isoWeek);
          expect(formatInZone(slot.issuedAt, zone, "i HH:mm")).toBe(`${issued[0]} ${issued[1]}`);
          expect(formatInZone(slot.dueAt, zone, "i HH:mm")).toBe(`${due[0]} ${due[1]}`);
          expect(Date.parse(slot.dueAt)).toBeGreaterThan(Date.parse(slot.issuedAt));
          expect(Date.parse(slot.dueAt) - Date.parse(slot.issuedAt)).toBeLessThanOrEqual(
            (7 * 24 + 1) * 60 * 60 * 1000,
          );
          expect(instanceWeekOf(instanceId(slot.presetId, slot.isoWeek))).toEqual({
            presetId: "hw.prop",
            isoWeek: slot.isoWeek,
          });
        }
        expect(
          current !== undefined && next !== undefined && next.issuedAt > current.issuedAt,
        ).toBe(true);
        const dueWeek = current === undefined ? undefined : isoWeekKey(current.dueAt, zone);
        expect(dueWeekOffset(recurrence)).toBe(dueWeek === current?.isoWeek ? 0 : 1);

        expect(events.length).toBeLessThanOrEqual(1);
        for (const input of events) {
          expect(input.occurredAt <= now).toBe(true);
          expect(EventIdSchema.safeParse(input.id).success).toBe(true);
          const parsed = parseEvent(event(1, input));
          expect(parsed.ok).toBe(true);
        }
      }),
    );
  });
});

describe("instanceWeekOf", () => {
  it("parses an instance id into its preset and week", () => {
    expect(instanceWeekOf("hw:hw.algebra:2026-W41")).toEqual({
      presetId: "hw.algebra",
      isoWeek: "2026-W41",
    });
  });

  it("is undefined for every other id", () => {
    expect(instanceWeekOf("01ARZ3NDEKTSV4RRFFQ69G5001")).toBeUndefined();
    expect(instanceWeekOf("auto:hw:hw.algebra:2026-W41:missed")).toBeUndefined();
    expect(instanceWeekOf("hw")).toBeUndefined();
    expect(instanceWeekOf("hw:hw.algebra")).toBeUndefined();
    expect(instanceWeekOf("hw::2026-W41")).toBeUndefined();
    expect(instanceWeekOf("hw:hw.algebra:")).toBeUndefined();
    expect(instanceWeekOf("hw:hw.algebra:2026-W41:extra")).toBeUndefined();
  });
});
