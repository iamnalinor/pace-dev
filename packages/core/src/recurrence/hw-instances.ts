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

/** The instances of one preset already in the state, whatever their outcome. */
const instancesOf = (tasks: TasksState, presetId: string): readonly Task[] =>
  Object.values(tasks.byId).filter((task) => instanceWeekOf(task.id)?.presetId === presetId);

/** Ids of one preset share their prefix, so the greatest id is the latest `YYYY-Www`. */
const latestOf = (instances: readonly Task[]): Task | undefined =>
  instances.find((task) => instances.every((other) => other.id <= task.id));

/**
The creation of one instance. It is numbered after every instance of the preset so far,
closed ones included, and inherits the estimate of the most recent one: the student
knows better than the preset how long a sheet takes.
*/
const instanceEvent = (
  slot: InstanceSlot,
  source: RecurringPreset,
  tasks: TasksState,
): EventInput => {
  const id = instanceId(slot.presetId, slot.isoWeek);
  const existing = instancesOf(tasks, slot.presetId);
  return {
    id,
    type: "task.created",
    occurredAt: slot.issuedAt,
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

/**
One `task.created` per expected slot that is already issued and has no task yet.
The deterministic id (`hw:<presetId>:<isoWeek>`) makes this idempotent across devices
and the server. At most one slot per preset can be issued at a time (the next week's
issue instant is always after `now`), so numbering within one batch cannot collide.
*/
export const missingInstanceEvents = (input: MissingInstancesInput): readonly EventInput[] =>
  expected(input.presets, input.now)
    .filter(
      ({ slot }) =>
        isIssuedBy(slot, input.now) &&
        taskById(input.tasks, instanceId(slot.presetId, slot.isoWeek)) === undefined,
    )
    .map(({ slot, source }) => instanceEvent(slot, source, input.tasks));
