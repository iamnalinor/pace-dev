import type { CoreState } from "../materialize/core-state.ts";
import type { Task } from "../model/task.ts";
import type { EventBody } from "../parse/apply.ts";
import type { QuickInput } from "./parse-quick-input.ts";

import { findProjectByName } from "../model/project.ts";
import { isOpen } from "../model/task.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";

const byDue = (a: Task, b: Task): number => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");

/** The open homework of a recurring course closest to its due: problems typed for it go there. */
export const openInstanceOf = (
  state: CoreState,
  presetId: string,
  now: string,
): Task | undefined => {
  const resolved = resolvePreset(state.presets, presetId);
  if (!resolved.ok || resolved.value.recurrence === null) {
    return undefined;
  }
  const open = Object.values(state.tasks.byId)
    .filter((task) => task.presetId === presetId && isOpen(task) && task.id.startsWith("hw:"))
    .toSorted(byDue);
  return open.find((task) => task.dueAt !== null && task.dueAt >= now) ?? open.at(-1);
};

type Ids = () => string;

const instanceBodies = (input: QuickInput, task: Task, newId: Ids): readonly EventBody[] => [
  ...(input.subtasks.length === 0
    ? []
    : [
        {
          type: "task.subtasks.added",
          payload: {
            taskId: task.id,
            subtasks: input.subtasks.map((subtask) => ({
              id: newId(),
              label: subtask.label,
              ...(subtask.number !== null && { number: subtask.number }),
            })),
          },
        } as const,
      ]),
  {
    type: "task.source.attached",
    payload: {
      taskId: task.id,
      sourceText: input.text.trim(),
      ...(input.link !== null && { sourceUrl: input.link }),
    },
  } as const,
];

const projectBodies = (
  input: QuickInput,
  state: CoreState,
  newId: Ids,
): { readonly projectId: null | string; readonly bodies: readonly EventBody[] } => {
  if (input.projectId !== null || input.projectName === null) {
    return { bodies: [], projectId: input.projectId };
  }
  const existing = findProjectByName(state.projects, input.projectName);
  if (existing !== undefined) {
    return { bodies: [], projectId: existing.id };
  }
  const projectId = newId();
  return {
    bodies: [{ type: "project.created", payload: { name: input.projectName, projectId } }],
    projectId,
  };
};

/**
What saving a composer reading writes, outside any client (the bot, the server): the
problems added to this week's homework of the course, or a new task (with a project
created on the fly). The typed text is the task's source, verbatim.
*/
export const quickInputBodies = (
  input: QuickInput,
  world: { readonly state: CoreState; readonly now: string },
  newId: Ids,
): readonly EventBody[] => {
  const instance = openInstanceOf(world.state, input.presetId, world.now);
  if (instance !== undefined) {
    return instanceBodies(input, instance, newId);
  }
  const project = projectBodies(input, world.state, newId);
  const title = input.title === "" ? input.text.trim() : input.title;
  return [
    ...project.bodies,
    {
      type: "task.created",
      payload: {
        taskId: newId(),
        title,
        presetId: input.presetId,
        ...(project.projectId !== null && { projectId: project.projectId }),
        importance: input.importance,
        ...(input.dueAt !== null &&
          input.dueTz !== null && { dueAt: input.dueAt, dueTz: input.dueTz }),
        ...(input.estimateMinutes !== null && { estimateMinutes: input.estimateMinutes }),
        subtasks: input.subtasks.map((subtask) => ({
          id: newId(),
          label: subtask.label,
          ...(subtask.number !== null && { number: subtask.number }),
        })),
        sourceText: input.text,
        fields: input.link === null ? {} : { link: input.link },
      },
    },
  ];
};
