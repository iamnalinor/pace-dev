import type { CoreState } from "../materialize/core-state.ts";
import type { Subtask, Task } from "../model/task.ts";
import type { ProposalBody, SubtaskDraft, TaskDraft, TaskPatch } from "./schema.ts";

import { type EventBody, subtasksAddedBodies } from "../input/bodies.ts";
import { namedProjectBodies, quickInputBodies } from "../input/compose.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { collectAll, err, ok, type Result } from "../result.ts";
import { validateEventInput } from "../validation/retro-rules.ts";
import {
  type Bodies,
  isBlank,
  type PlanContext,
  type Planned,
  type ProposalError,
  stamped,
} from "./plan-context.ts";

export type TaskProposal = Extract<ProposalBody, { readonly kind: `task.${string}` }>;

type World = { readonly state: CoreState; readonly ctx: PlanContext };

/** Task events go through the same gate as every other write (the retro rules), stamped now. */
const validated = ({ ctx, state }: World, bodies: readonly EventBody[]): Planned =>
  collectAll(bodies, (body) => {
    const checked = validateEventInput(state, stamped(ctx, body), ctx.now);
    return checked.ok ? ok([checked.value]) : checked;
  });

/** A new task, or this week's homework of a course when the draft belongs to one. */
const createBodies = ({ ctx, state }: World, task: TaskDraft): Bodies => {
  if (isBlank(task.title)) {
    return err("proposal/invalid");
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
    projectId: task.projectId,
    projectName: task.projectName,
    spans: [],
    subtasks: task.subtasks,
    text: task.sourceText ?? "",
    title: task.title.trim(),
  };
  return ok(quickInputBodies(input, { now: ctx.now, state }, ctx.newId));
};

const subtaskById = (task: Task, id: string): Result<Subtask, "proposal/unknown-subtask"> => {
  const subtask = task.subtasks.find((item) => item.id === id);
  return subtask === undefined ? err("proposal/unknown-subtask") : ok(subtask);
};

const removedBody = (task: Task, subtaskId: string): EventBody => ({
  payload: { subtaskId, taskId: task.id },
  type: "task.subtask.removed",
});

type Rename = NonNullable<NonNullable<TaskPatch["subtasks"]>["rename"]>[number];

/** A rename: the problem off, back under its new name with its number (there is no rename event). */
const renamed = (task: Task, rename: Rename): Result<readonly SubtaskDraft[], ProposalError> => {
  const subtask = subtaskById(task, rename.subtaskId);
  if (!subtask.ok) {
    return subtask;
  }
  // A solved or sent one keeps its name: taking it off would lose the mark.
  if (subtask.value.solvedAt !== null || subtask.value.submittedAt !== null) {
    return err("proposal/subtask-done");
  }
  return isBlank(rename.label)
    ? err("proposal/invalid")
    : ok([{ label: rename.label.trim(), number: subtask.value.number }]);
};

/** Removed problems, renamed ones (off and back), then the new ones. */
const subtaskBodies = (task: Task, edits: TaskPatch["subtasks"], ctx: PlanContext): Bodies => {
  const renames = edits?.rename ?? [];
  const removed = collectAll(edits?.remove ?? [], (id) => {
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

const projectBodies = (
  { ctx, state }: World,
  task: Task,
  patch: TaskPatch,
): readonly EventBody[] => {
  if (patch.projectName !== undefined) {
    const named = namedProjectBodies(state, patch.projectName.trim(), ctx.newId);
    return [
      ...named.bodies,
      { payload: { projectId: named.projectId, taskId: task.id }, type: "task.project.set" },
    ];
  }
  return patch.projectId === undefined
    ? []
    : [{ payload: { projectId: patch.projectId, taskId: task.id }, type: "task.project.set" }];
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
    return err("proposal/invalid");
  }
  const subtasks = subtaskBodies(task, patch.subtasks, world.ctx);
  if (!subtasks.ok) {
    return subtasks;
  }
  const bodies = [
    ...updatedBodies(task, patch),
    ...importanceBodies(task, patch),
    ...projectBodies(world, task, patch),
    ...settingBodies(task, patch),
    ...subtasks.value,
  ];
  return bodies.length === 0 ? err("proposal/empty-patch") : ok(bodies);
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
  return open.ok && open.value.length === 0 ? err("proposal/empty-patch") : open;
};

/** The events of a proposal about an existing task. */
const editBodies = (
  world: World,
  task: Task,
  proposal: Exclude<TaskProposal, { readonly kind: "task.create" }>,
): Bodies => {
  switch (proposal.kind) {
    case "task.update": {
      return updateBodies(world, task, proposal.patch);
    }
    case "task.delete": {
      return ok([{ payload: { targetId: task.createdEventId }, type: "event.revoked" }]);
    }
    case "task.close": {
      return ok([{ payload: { outcome: proposal.outcome, taskId: task.id }, type: "task.closed" }]);
    }
    case "task.addSubtasks": {
      return proposal.subtasks.some((subtask) => isBlank(subtask.label))
        ? err("proposal/invalid")
        : ok(subtasksAddedBodies(task.id, proposal.subtasks, () => world.ctx.newId()));
    }
    case "task.markSubtasks": {
      return markBodies(task, proposal.subtaskIds);
    }
  }
};

/** A task proposal's events, checked by the retro rules; an id the state does not know is refused. */
export const planTask = (state: CoreState, proposal: TaskProposal, ctx: PlanContext): Planned => {
  const world = { ctx, state };
  if (proposal.kind === "task.create") {
    const bodies = createBodies(world, proposal.task);
    return bodies.ok ? validated(world, bodies.value) : bodies;
  }
  const task = state.tasks.byId[proposal.taskId];
  if (task === undefined) {
    return err("proposal/unknown-task");
  }
  const bodies = editBodies(world, task, proposal);
  return bodies.ok ? validated(world, bodies.value) : bodies;
};
