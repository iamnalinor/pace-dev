import type { CoreState } from "../materialize/core-state.ts";
import type { Task } from "../model/task.ts";
import type { ModelAction } from "../parse/schema.ts";
import type { SubtaskDraft, TaskPatch } from "./schema.ts";

import { shortTitle } from "../input/parse-quick-input.ts";
import { findProjectByName } from "../model/project.ts";
import { presetById } from "../presets/preset-reducer.ts";
import { accountTz, type QueryContext } from "../queries/context.ts";
import { wallClockInstant } from "../time.ts";

const END_OF_DAY = "23:59";

/** A string the model gave with something in it. */
export const isGiven = (value: null | string): value is string =>
  value !== null && value.trim() !== "";

/** A preset id from the list or a preset's name; an archived or unknown one is no category. */
export const presetOf = (state: CoreState, category: null | string): string | undefined => {
  if (category === null) {
    return undefined;
  }
  const byId = presetById(state.presets, category);
  if (byId !== undefined && !byId.archived) {
    return byId.id;
  }
  const lower = category.toLowerCase();
  return Object.values(state.presets.byId).find(
    (preset) => !preset.archived && preset.name.toLowerCase() === lower,
  )?.id;
};

/** A project of the list by its name, or the name of one to create. */
export const projectOf = (
  state: CoreState,
  name: string,
): { readonly projectId: null | string; readonly projectName: null | string } => {
  const existing = findProjectByName(state.projects, name);
  return existing === undefined
    ? { projectId: null, projectName: name.trim() }
    : { projectId: existing.id, projectName: null };
};

/** The due the model gave, on the account's wall clock (the end of the day without a time). */
export const dueOf = (action: ModelAction, zone: string): null | string =>
  action.dueDate === null
    ? null
    : wallClockInstant(action.dueDate, action.dueTime ?? END_OF_DAY, zone);

/** The subtasks the model gave, without blank ones. */
export const subtasksOf = (action: ModelAction): readonly SubtaskDraft[] =>
  action.subtasks
    .map((subtask) => ({ label: subtask.label.trim(), number: subtask.number }))
    .filter((subtask) => subtask.label !== "");

const isNamed = (ref: string, subtask: Task["subtasks"][number]): boolean =>
  subtask.label.toLowerCase() === ref.trim().toLowerCase() || String(subtask.number) === ref.trim();

/** The ids of the subtasks named by label or number; the names that match none are dropped. */
export const subtaskIdsOf = (task: Task, refs: readonly string[]): readonly string[] =>
  task.subtasks.filter((subtask) => refs.some((ref) => isNamed(ref, subtask))).map(({ id }) => id);

const subtaskPatch = (task: Task, action: ModelAction): TaskPatch => {
  const remove = subtaskIdsOf(task, action.subtaskRefs);
  const renames = action.renames.filter((rename) => rename.label.trim() !== "");
  const rename = renames.flatMap(({ label, subtask }) =>
    task.subtasks
      .filter((item) => isNamed(subtask, item))
      .slice(0, 1)
      .map(({ id }) => ({ label, subtaskId: id })),
  );
  const edits = {
    ...(subtasksOf(action).length > 0 && { add: [...subtasksOf(action)] }),
    ...(remove.length > 0 && { remove: [...remove] }),
    ...(rename.length > 0 && { rename }),
  };
  return Object.keys(edits).length === 0 ? {} : { subtasks: edits };
};

type Cleared = ReadonlySet<ModelAction["clear"][number]>;

const textPatch = (action: ModelAction, cleared: Cleared): TaskPatch => ({
  ...(isGiven(action.title) &&
    shortTitle(action.title) !== "" && {
      title: shortTitle(action.title),
    }),
  ...(action.description !== null && { description: action.description }),
  ...(cleared.has("description") && { description: null }),
  ...(action.link !== null && { link: action.link }),
  ...(cleared.has("link") && { link: null }),
});

const duePatch = (
  task: Task,
  action: ModelAction,
  { cleared, zone }: { readonly zone: string; readonly cleared: Cleared },
): TaskPatch => {
  if (cleared.has("dueDate")) {
    return { due: null };
  }
  const dueAt = dueOf(action, zone);
  return dueAt === null ? {} : { due: { at: dueAt, tz: task.dueTz ?? zone } };
};

const projectPatch = (state: CoreState, action: ModelAction, cleared: Cleared): TaskPatch => {
  if (cleared.has("project")) {
    return { projectId: null };
  }
  if (!isGiven(action.project)) {
    return {};
  }
  const project = projectOf(state, action.project);
  return project.projectId === null
    ? { projectName: project.projectName ?? action.project }
    : { projectId: project.projectId };
};

const settingPatch = (task: Task, action: ModelAction, state: CoreState): TaskPatch => {
  const presetId = presetOf(state, action.category);
  return {
    ...(action.importance !== null && { importance: action.importance }),
    ...(presetId !== undefined && presetId !== task.presetId && { presetId }),
    ...(action.estimateMinutes !== null && { estimateMinutes: action.estimateMinutes }),
    ...(action.clear.includes("estimateMinutes") && { estimateMinutes: null }),
  };
};

/** An edit: each field the model gave, each one it cleared; nothing else changes. */
export const patchOf = (
  task: Task,
  action: ModelAction,
  world: { readonly state: CoreState; readonly ctx: QueryContext },
): TaskPatch => {
  const cleared: Cleared = new Set(action.clear);
  return {
    ...textPatch(action, cleared),
    ...duePatch(task, action, { cleared, zone: accountTz(world.state, world.ctx) }),
    ...projectPatch(world.state, action, cleared),
    ...settingPatch(task, action, world.state),
    ...subtaskPatch(task, action),
  };
};
