import {
  type ActivityCategory,
  type CoreState,
  presetChain,
  type QueryContext,
  type Task,
  type TimeState,
} from "@pace/core";

/** A task the activity can be linked to. */
export type DetailsTask = { readonly id: string; readonly title: string };

/** What the details sheet offers for a button: tasks to link and labels used before. */
export type DetailsModel = {
  readonly tasks: readonly DetailsTask[];
  readonly labels: readonly string[];
};

/** Work links to the open work tasks, Study to the open homework; other activities to none. */
const FAMILY: Partial<Readonly<Record<ActivityCategory, string>>> = { study: "hw", work: "work" };

const MAX_TASKS = 6;
const MAX_LABELS = 5;

/** Soonest due first, undated ones last, the title breaking ties. */
const byDue = (a: Task, b: Task): number => {
  const due = (a.dueAt ?? "~").localeCompare(b.dueAt ?? "~");
  return due === 0 ? a.title.localeCompare(b.title) : due;
};

const familyOf = (state: CoreState, presetId: string): null | string => {
  const chain = presetChain(state.presets, presetId);
  return chain.ok ? (chain.value[0]?.id ?? null) : null;
};

const keyOf = (label: string): string => label.trim().toLowerCase();

/**
Labels of past activities, newest first, each once (case aside, the latest spelling wins);
only the given category's when one is given.
*/
export const recentLabels = (
  time: TimeState,
  category?: ActivityCategory,
  max = MAX_LABELS,
): readonly string[] => {
  const newest = Object.values(time.activities)
    .filter((activity) => category === undefined || activity.category === category)
    .filter((activity) => keyOf(activity.label) !== "")
    .toSorted((a, b) => b.startAt.localeCompare(a.startAt))
    .map((activity) => activity.label.trim());
  return newest
    .filter((label, index) => newest.findIndex((other) => keyOf(other) === keyOf(label)) === index)
    .slice(0, max);
};

/** The details sheet's choices for a button: its family's open tasks, soonest due first. */
export const detailsModel = (
  state: CoreState,
  button: { readonly category: ActivityCategory; readonly label: string },
  _ctx: QueryContext,
): DetailsModel => {
  const family = FAMILY[button.category];
  const tasks =
    family === undefined
      ? []
      : Object.values(state.tasks.byId)
          .filter((task) => task.closed === null && familyOf(state, task.presetId) === family)
          .toSorted(byDue)
          .slice(0, MAX_TASKS)
          .map((task) => ({ id: task.id, title: task.title }));
  return {
    labels: recentLabels(state.time, button.category).filter(
      (label) => label.toLowerCase() !== button.label.toLowerCase(),
    ),
    tasks,
  };
};
