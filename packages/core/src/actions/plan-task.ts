import type { CoreState } from "../materialize/core-state.ts";
import type { Subtask, Task } from "../model/task.ts";
import type { ActionBody, SubtaskDraft, TaskDraft, TaskPatch } from "./schema.ts";

import { type EventBody, subtasksAddedBodies } from "../input/bodies.ts";
import { quickInputBodies } from "../input/compose.ts";
import { findProjectByName, projectById } from "../model/project.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { collectAll, err, ok, type Result } from "../result.ts";
import { validateEventInput } from "../validation/retro-rules.ts";
import {
  type ActionError,
  type Bodies,
  isBlank,
  type PlanContext,
  type Planned,
  stamped,
} from "./plan-context.ts";

export type TaskAction = Extract<ActionBody, { readonly kind: `task.${string}` }>;

type World = { readonly state: CoreState; readonly ctx: PlanContext };

/** Task events go through the same gate as every other write (the retro rules), stamped now. */
const validated = ({ ctx, state }: World, bodies: readonly EventBody[]): Planned =>
  collectAll(bodies, (body) => {
    const checked = validateEventInput(state, stamped(ctx, body), ctx.now);
    return checked.ok ? ok([checked.value]) : checked;
  });

/** Assistant actions may refer only to active projects already in the account. */
const existingProject = (
  state: CoreState,
  id: null | string,
  name: null | string,
): Result<null | string, ActionError> => {
  if (id !== null && name !== null) {
    return err("action/invalid");
  }
  if (name !== null) {
    const project = findProjectByName(state.projects, name);
    return project === undefined || project.archived
      ? err("action/unknown-project")
      : ok(project.id);
  }
  if (id === null) {
    return ok(null);
  }
  const project = projectById(state.projects, id);
  return project === undefined || project.archived ? err("action/unknown-project") : ok(project.id);
};

/** A new task, or this week's homework of a course when the draft belongs to one. */
const createBodies = ({ ctx, state }: World, task: TaskDraft): Bodies => {
  if (isBlank(task.title)) {
    return err("action/invalid");
  }
  const project = existingProject(state, task.projectId, task.projectName);
  if (!project.ok) {
    return project;
  }
  const preset = resolvePreset(state.presets, task.presetId);
  const input = {
    description: task.description,
    dueAt: task.dueAt,
    dueTz: task.dueAt === null ? null : (task.dueTz ?? ctx.deviceTz),
    estimateMinutes: task.estimateMinutes,
    importance: task.importance ?? (preset.ok ? preset.value.defaultImportance : "normal"),
    isImportanceExplicit: task.importance !== null,
    link: task.link,
    presetId: task.presetId,
    projectId: project.value,
    projectName: null,
    spans: [],
    subtasks: task.subtasks,
    text: task.sourceText ?? "",
    title: task.title.trim(),
  };
  return ok(quickInputBodies(input, { now: ctx.now, state }, ctx.newId));
};

const subtaskById = (task: Task, id: string): Result<Subtask, "action/unknown-subtask"> => {
  const subtask = task.subtasks.find((item) => item.id === id);
  return subtask === undefined ? err("action/unknown-subtask") : ok(subtask);
};

const removedBody = (task: Task, subtaskId: string): EventBody => ({
  payload: { subtaskId, taskId: task.id },
  type: "task.subtask.removed",
});

type Rename = NonNullable<NonNullable<TaskPatch["subtasks"]>["rename"]>[number];

/** A rename: the problem off, back under its new name with its number (there is no rename event). */
const renamed = (task: Task, rename: Rename): Result<readonly SubtaskDraft[], ActionError> => {
  const subtask = subtaskById(task, rename.subtaskId);
  if (!subtask.ok) {
    return subtask;
  }
  // A solved or sent one keeps its name: taking it off would lose the mark.
  if (subtask.value.solvedAt !== null || subtask.value.submittedAt !== null) {
    return err("action/subtask-done");
  }
  return isBlank(rename.label)
    ? err("action/invalid")
    : ok([{ label: rename.label.trim(), number: subtask.value.number }]);
};

/** Removed problems, renamed ones (off and back), then the new ones; a removal wins over a rename. */
const subtaskBodies = (task: Task, edits: TaskPatch["subtasks"], ctx: PlanContext): Bodies => {
  const removals = new Set(edits?.remove);
  const renames = (edits?.rename ?? []).filter((rename) => !removals.has(rename.subtaskId));
  const removed = collectAll([...removals], (id) => {
    const subtask = subtaskById(task, id);
    return subtask.ok ? ok([removedBody(task, id)]) : subtask;
  });
  const readded = collectAll(renames, (rename) => renamed(task, rename));
  if (!removed.ok || !readded.ok) {
    return removed.ok ? (readded as Bodies) : removed;
  }
  return ok([
    ...removed.value,
    ...renames.map((rename) => removedBody(task, rename.subtaskId)),
    ...subtasksAddedBodies(task.id, [...readded.value, ...(edits?.add ?? [])], () => ctx.newId()),
  ]);
};

/** The due date as `task.updated` writes it: `null` clears it, a set one carries its zone. */
const dueFields = (due: TaskPatch["due"]) => {
  if (due === undefined) {
    return {};
  }
  return due === null ? { dueAt: null } : { dueAt: due.at, dueTz: due.tz };
};

/** The link as `task.updated` writes it: the whole fields, the rest kept. */
const linkFields = (task: Task, link: TaskPatch["link"]) =>
  link === undefined
    ? {}
    : {
        fields: {
          ...(link !== null && { link }),
          ...(task.fields.submitVia !== null && { submitVia: task.fields.submitVia }),
        },
      };

/** `task.updated`: the title, the description, the due date and the link. */
const updatedBodies = (task: Task, patch: TaskPatch): readonly EventBody[] => {
  const payload = {
    ...(patch.title !== undefined && { title: patch.title.trim() }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...dueFields(patch.due),
    ...linkFields(task, patch.link),
  };
  return Object.keys(payload).length === 0
    ? []
    : [{ payload: { taskId: task.id, ...payload }, type: "task.updated" }];
};

const projectBodies = ({ state }: World, task: Task, patch: TaskPatch): Bodies => {
  if (patch.projectName !== undefined) {
    const project = existingProject(state, null, patch.projectName);
    return project.ok
      ? ok([{ payload: { projectId: project.value, taskId: task.id }, type: "task.project.set" }])
      : project;
  }
  if (patch.projectId === undefined) {
    return ok([]);
  }
  const project = existingProject(state, patch.projectId, null);
  return project.ok
    ? ok([{ payload: { projectId: project.value, taskId: task.id }, type: "task.project.set" }])
    : project;
};

const importanceBodies = (task: Task, patch: TaskPatch): readonly EventBody[] =>
  patch.importance === undefined
    ? []
    : [{ payload: { importance: patch.importance, taskId: task.id }, type: "task.importance.set" }];

/** The category and the estimate: one event each. */
const settingBodies = (task: Task, patch: TaskPatch): readonly EventBody[] => [
  ...(patch.presetId === undefined
    ? []
    : [
        {
          payload: { presetId: patch.presetId, taskId: task.id },
          type: "task.preset.set",
        } as const,
      ]),
  ...(patch.estimateMinutes === undefined
    ? []
    : [
        {
          payload: { estimateMinutes: patch.estimateMinutes, taskId: task.id },
          type: "task.estimate.set",
        } as const,
      ]),
];

/** Each changed field with the event that changes it; the subtasks last. */
const updateBodies = (world: World, task: Task, patch: TaskPatch): Bodies => {
  if (patch.title !== undefined && isBlank(patch.title)) {
    return err("action/invalid");
  }
  const subtasks = subtaskBodies(task, patch.subtasks, world.ctx);
  if (!subtasks.ok) {
    return subtasks;
  }
  const project = projectBodies(world, task, patch);
  if (!project.ok) {
    return project;
  }
  const bodies = [
    ...updatedBodies(task, patch),
    ...importanceBodies(task, patch),
    ...project.value,
    ...settingBodies(task, patch),
    ...subtasks.value,
  ];
  return bodies.length === 0 ? err("action/empty-patch") : ok(bodies);
};

/** The named problems not solved yet, marked solved; nothing left to mark is an empty patch. */
const markBodies = (task: Task, subtaskIds: readonly string[]): Bodies => {
  const open = collectAll(subtaskIds, (id) => {
    const subtask = subtaskById(task, id);
    if (!subtask.ok) {
      return subtask;
    }
    return ok(
      subtask.value.solvedAt === null
        ? [{ payload: { subtaskId: id, taskId: task.id }, type: "task.subtask.solved" } as const]
        : [],
    );
  });
  return open.ok && open.value.length === 0 ? err("action/empty-patch") : open;
};

/**
The message problems were added or solved from, kept as the task's source (as a homework
message is): what the person wrote stays next to what it did.
*/
const withSource = (
  bodies: Bodies,
  { ctx, task }: { readonly ctx: PlanContext; readonly task: Task },
): Bodies =>
  !bodies.ok || ctx.sourceText === undefined || isBlank(ctx.sourceText)
    ? bodies
    : ok([
        ...bodies.value,
        { payload: { sourceText: ctx.sourceText, taskId: task.id }, type: "task.source.attached" },
      ]);

/** The events of a action about an existing task. */
const editBodies = (
  world: World,
  task: Task,
  action: Exclude<TaskAction, { readonly kind: "task.create" }>,
): Bodies => {
  switch (action.kind) {
    case "task.update": {
      return updateBodies(world, task, action.patch);
    }
    case "task.delete": {
      return ok([{ payload: { targetId: task.createdEventId }, type: "event.revoked" }]);
    }
    case "task.close": {
      return ok([{ payload: { outcome: action.outcome, taskId: task.id }, type: "task.closed" }]);
    }
    case "task.addSubtasks": {
      return action.subtasks.some((subtask) => isBlank(subtask.label))
        ? err("action/invalid")
        : withSource(ok(subtasksAddedBodies(task.id, action.subtasks, () => world.ctx.newId())), {
            ctx: world.ctx,
            task,
          });
    }
    case "task.markSubtasks": {
      return withSource(markBodies(task, action.subtaskIds), { ctx: world.ctx, task });
    }
  }
};

/** A task action's events, checked by the retro rules; an id the state does not know is refused. */
export const planTask = (state: CoreState, action: TaskAction, ctx: PlanContext): Planned => {
  const world = { ctx, state };
  if (action.kind === "task.create") {
    const bodies = createBodies(world, action.task);
    return bodies.ok ? validated(world, bodies.value) : bodies;
  }
  const task = state.tasks.byId[action.taskId];
  if (task === undefined) {
    return err("action/unknown-task");
  }
  const bodies = editBodies(world, task, action);
  return bodies.ok ? validated(world, bodies.value) : bodies;
};
