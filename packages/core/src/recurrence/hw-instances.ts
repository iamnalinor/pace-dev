import { tz } from "@date-fns/tz";
import { addDays, set } from "date-fns";

import type { EventInput } from "../events/event-schema.ts";
import type { Preset, Recurrence, ResolvedPreset, WeekSlot } from "../model/preset.ts";
import type { PresetsState } from "../presets/preset-reducer.ts";

import { instanceId } from "../ids.ts";
import { type Task, taskById, type TasksState } from "../model/task.ts";
import { dueWeekOffset } from "../presets/recurrence.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { isoWeekKey, startOfWeekIn } from "../time.ts";

/** One homework instance a recurring preset expects: the week it belongs to and its two instants. */
export type InstanceSlot = {
  readonly presetId: string;
  /** As `isoWeekKey` returns it (`2026-W41`), read in the recurrence zone. */
  readonly isoWeek: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly dueTz: string;
};

/** The two parts of an instance id (`hw:<presetId>:<isoWeek>`). */
export type InstanceRef = {
  readonly presetId: string;
  readonly isoWeek: string;
};

export type MissingInstancesInput = {
  readonly tasks: TasksState;
  readonly presets: PresetsState;
  readonly now: string;
  /** Ids already in the log: an instance taken back (revoked) counts as made. */
  readonly existingEventIds?: ReadonlySet<string> | undefined;
};

/** Inverse of `instanceId`; `undefined` for every id that is not a homework instance. */
export const instanceWeekOf = (taskId: string): InstanceRef | undefined => {
  const parts = taskId.split(":");
  const [prefix, presetId = "", isoWeek = ""] = parts;
  const isInstance = parts.length === 3 && prefix === "hw" && presetId !== "" && isoWeek !== "";
  return isInstance ? { presetId, isoWeek } : undefined;
};

type RecurringPreset = {
  readonly preset: Preset;
  readonly resolved: ResolvedPreset;
  readonly recurrence: Recurrence;
};

/** The preset with its resolved schedule, or null when archived or without a recurrence. */
const recurringPreset = (presets: PresetsState, preset: Preset): null | RecurringPreset => {
  if (preset.archived) {
    return null;
  }
  const resolved = resolvePreset(presets, preset.id);
  return resolved.ok && resolved.value.recurrence !== null
    ? { preset, resolved: resolved.value, recurrence: resolved.value.recurrence }
    : null;
};

/** Non-archived presets whose chain resolves to a schedule; the built-ins carry none. */
const recurringPresets = (presets: PresetsState): readonly RecurringPreset[] =>
  Object.values(presets.byId)
    .map((preset) => recurringPreset(presets, preset))
    .filter((candidate): candidate is RecurringPreset => candidate !== null);

const toIso = (date: Date): string => new Date(date).toISOString();

/** The ISO week containing `now`: its Monday 00:00 in the recurrence zone, and that zone. */
type Week = {
  readonly startIso: string;
  readonly zone: string;
};

/**
The instant of `slot` in the week that begins `weeks` weeks after `week`. Days are added
and the clock is set on the zone's calendar, so a schedule keeps its wall-clock time
across a summer-time change; a time that does not exist on the change night resolves
forward.
*/
const slotInstant = (week: Week, weeks: number, slot: WeekSlot): string => {
  const context = { in: tz(week.zone) };
  const day = addDays(week.startIso, weeks * 7 + slot.weekday - 1, context);
  // `HH:MM` is enforced by the preset schema.
  const clock = { hours: Number(slot.time.slice(0, 2)), minutes: Number(slot.time.slice(3)) };
  return toIso(set(day, { ...clock, seconds: 0, milliseconds: 0 }, context));
};

/** The slot of the ISO week containing `now` and of the next one, read in the recurrence zone. */
const weekSlots = (source: RecurringPreset, now: string): readonly InstanceSlot[] => {
  const { recurrence } = source;
  const week: Week = { startIso: startOfWeekIn(now, recurrence.tz), zone: recurrence.tz };
  return [0, 1].map((weeks) => {
    const issuedAt = slotInstant(week, weeks, recurrence.issued);
    return {
      presetId: source.preset.id,
      isoWeek: isoWeekKey(issuedAt, recurrence.tz),
      issuedAt,
      dueAt: slotInstant(week, weeks + dueWeekOffset(recurrence), recurrence.due),
      dueTz: recurrence.tz,
    };
  });
};

type Expected = {
  readonly slot: InstanceSlot;
  readonly source: RecurringPreset;
};

/** Issue order, then preset id: the order the instances appear in. */
const compareExpected = (a: Expected, b: Expected): number => {
  if (a.slot.issuedAt !== b.slot.issuedAt) {
    return a.slot.issuedAt < b.slot.issuedAt ? -1 : 1;
  }
  return a.slot.presetId < b.slot.presetId ? -1 : 1;
};

const expected = (presets: PresetsState, now: string): readonly Expected[] =>
  recurringPresets(presets)
    .flatMap((source) => weekSlots(source, now).map((slot) => ({ slot, source })))
    .toSorted(compareExpected);

/**
Every instance a recurring preset expects for the ISO week containing `now` and the
following one. Archived presets expect nothing; existing tasks do not matter here.
*/
export const expectedInstances = (presets: PresetsState, now: string): readonly InstanceSlot[] =>
  expected(presets, now).map((item) => item.slot);

/** Instants are compared as instants: mixed sub-second precision would break string order. */
const isIssuedBy = (slot: InstanceSlot, now: string): boolean =>
  Date.parse(slot.issuedAt) <= Date.parse(now);

/** A deadline that passed before the course was added: there was nothing to do in Pace. */
const isBeforeCourse = (slot: InstanceSlot, source: RecurringPreset): boolean =>
  Date.parse(slot.dueAt) < Date.parse(source.preset.createdAt);

/** The instances of one preset already in the state, whatever their outcome. */
const instancesOf = (tasks: TasksState, presetId: string): readonly Task[] =>
  Object.values(tasks.byId).filter((task) => instanceWeekOf(task.id)?.presetId === presetId);

/** Ids of one preset share their prefix, so the greatest id is the latest `YYYY-Www`. */
const latestOf = (instances: readonly Task[]): Task | undefined =>
  instances.find((task) => instances.every((other) => other.id <= task.id));

/**
When an instance made ahead of its issue is recorded: a week before the issue (the previous
week's issue, already past), never before the course. It depends only on the slot and the
preset, so every device and the server write the same event; it starts at the issue instant
and waits under "In future".
*/
const aheadAt = ({ slot, source }: Expected, now: string): string => {
  const weekBefore = toIso(addDays(slot.issuedAt, -7, { in: tz(source.recurrence.tz) }));
  const at = Math.max(Date.parse(weekBefore), Date.parse(source.preset.createdAt));
  // A course is never created after `now`; the guard only keeps an event out of the future.
  return new Date(Math.min(at, Date.parse(now))).toISOString();
};

/**
The creation of one instance. It is numbered after every instance of the preset so far,
closed ones included, and inherits the estimate of the most recent one: the student
knows better than the preset how long a sheet takes.
*/
const instanceEvent = (item: Expected, tasks: TasksState, now: string): EventInput => {
  const { slot, source } = item;
  const id = instanceId(slot.presetId, slot.isoWeek);
  const existing = instancesOf(tasks, slot.presetId);
  return {
    id,
    type: "task.created",
    occurredAt: isIssuedBy(slot, now) ? slot.issuedAt : aheadAt(item, now),
    precision: "exact",
    source: "system",
    payload: {
      taskId: id,
      title: `${source.preset.name} ${existing.length + 1}`,
      presetId: slot.presetId,
      dueAt: slot.dueAt,
      dueTz: slot.dueTz,
      startAt: slot.issuedAt,
      startTz: source.recurrence.tz,
      estimateMinutes:
        latestOf(existing)?.estimateMinutes ?? source.resolved.defaultEstimateMinutes,
      subtasks: [],
      fields: {},
    },
  };
};

/** Not made yet: no task, and not made and taken back either. */
const isMissing = (input: MissingInstancesInput, slot: InstanceSlot): boolean => {
  const id = instanceId(slot.presetId, slot.isoWeek);
  return taskById(input.tasks, id) === undefined && input.existingEventIds?.has(id) !== true;
};

/**
What one preset needs now: its issued slot if it has no task yet (unless its deadline passed
before the course was added), else, while no instance of it is open, the next slot ahead of
its issue, so the week's homework is on the plan before it is given.
*/
const missingFor = (
  slots: readonly Expected[],
  input: MissingInstancesInput,
): readonly Expected[] => {
  const { now, tasks } = input;
  const issued = slots.filter(
    (item) =>
      isIssuedBy(item.slot, now) &&
      !isBeforeCourse(item.slot, item.source) &&
      isMissing(input, item.slot),
  );
  if (issued.length > 0) {
    return issued;
  }
  const [first] = slots;
  const hasOpen =
    first !== undefined &&
    instancesOf(tasks, first.slot.presetId).some((task) => task.closed === null);
  const ahead = slots.find((item) => !isIssuedBy(item.slot, now));
  return hasOpen || ahead === undefined || !isMissing(input, ahead.slot) ? [] : [ahead];
};

/**
One `task.created` per instance a preset needs (see `missingFor`). The deterministic id
(`hw:<presetId>:<isoWeek>`) makes this idempotent across devices and the server, and a
slot made ahead is not made again at its issue. At most one slot per preset is created in a
batch, so numbering within one batch cannot collide.
*/
export const missingInstanceEvents = (input: MissingInstancesInput): readonly EventInput[] => {
  const all = expected(input.presets, input.now);
  const presetIds = [...new Set(all.map((item) => item.slot.presetId))];
  return presetIds
    .flatMap((presetId) =>
      missingFor(
        all.filter((item) => item.slot.presetId === presetId),
        input,
      ),
    )
    .toSorted(compareExpected)
    .map((item) => instanceEvent(item, input.tasks, input.now));
};
