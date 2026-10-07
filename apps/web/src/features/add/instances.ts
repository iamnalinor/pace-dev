import {
  addMinutesIso,
  type CoreState,
  instanceWeekOf,
  isOpen,
  isoWeekKey,
  type Task,
} from "@pace/core";

const MINUTES_PER_WEEK = 7 * 24 * 60;

/** An open homework instance problems can be added to, and whether it is due this or next week. */
export type InstanceChoice = {
  readonly id: string;
  readonly title: string;
  readonly week: "next" | "other" | "this";
};

const byDue = (a: Task, b: Task): number =>
  (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt);

/** The open instances of a recurring preset, the one due first first: that is the current one. */
export const openInstances = (
  state: CoreState,
  presetId: string,
  { now, zone }: { readonly now: string; readonly zone: string },
): readonly InstanceChoice[] => {
  const thisWeek = isoWeekKey(now, zone);
  const nextWeek = isoWeekKey(addMinutesIso(now, MINUTES_PER_WEEK), zone);
  return Object.values(state.tasks.byId)
    .filter((task) => isOpen(task) && instanceWeekOf(task.id)?.presetId === presetId)
    .toSorted(byDue)
    .map((task) => {
      const week = isoWeekKey(task.dueAt ?? task.createdAt, zone);
      const weeks: Readonly<Record<string, InstanceChoice["week"]>> = {
        [nextWeek]: "next",
        [thisWeek]: "this",
      };
      return { id: task.id, title: task.title, week: weeks[week] ?? "other" };
    });
};
