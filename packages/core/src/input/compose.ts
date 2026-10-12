import type { CoreState } from "../materialize/core-state.ts";
import type { QuickInput } from "./parse-quick-input.ts";

import { findProjectByName } from "../model/project.ts";
import { isOpen, type Task } from "../model/task.ts";
import { resolvePreset } from "../presets/resolve-preset.ts";
import { startOfDayIn } from "../time.ts";
import { type EventBody, subtasksAddedBodies } from "./bodies.ts";

const byDue = (a: Task, b: Task): number => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");

/** The open weekly instances of a recurring course, the earliest due first. */
export const openInstancesOf = (state: CoreState, presetId: string): readonly Task[] => {
  const resolved = resolvePreset(state.presets, presetId);
  return !resolved.ok || resolved.value.recurrence === null
    ? []
    : Object.values(state.tasks.byId)
        .filter((task) => task.presetId === presetId && isOpen(task) && task.id.startsWith("hw:"))
        .toSorted(byDue);
};

/** A due the text named, in the zone it was read in. */
export type NamedDue = { readonly at: string; readonly tz: string };

/** The due a reading named, if any. */
export const dueOfInput = (input: QuickInput): NamedDue | null =>
  input.dueAt === null || input.dueTz === null ? null : { at: input.dueAt, tz: input.dueTz };

/**
Which week's homework a message for a recurring course belongs to. Without a due it is the
nearest open instance (the earliest still ahead, else the last one); with a due it is the
instance due that same day, or none: a homework with another deadline is a task of its own.
*/
export const openInstanceOf = (
  state: CoreState,
  presetId: string,
  { due = null, now }: { readonly now: string; readonly due?: NamedDue | null },
): Task | undefined => {
  const open = openInstancesOf(state, presetId);
  if (due !== null) {
    const day = startOfDayIn(due.at, due.tz);
    return open.find((task) => task.dueAt !== null && startOfDayIn(task.dueAt, due.tz) === day);
  }
  return open.find((task) => task.dueAt !== null && task.dueAt >= now) ?? open.at(-1);
};

type Ids = () => string;

/**
What a message adds to an existing homework besides its problems: the description (after the
one it has), the link, and an estimate the message stated.
*/
const detailBodies = (input: QuickInput, task: Task): readonly EventBody[] => {
  const description =
    input.description === null
      ? null
      : [task.description, input.description].filter((part) => part !== null).join("\n\n");
  const hasUpdate = description !== null || input.link !== null;
  return [
    ...(hasUpdate
      ? [
          {
            type: "task.updated",
            payload: {
              taskId: task.id,
              ...(description !== null && { description }),
              ...(input.link !== null && { fields: { link: input.link } }),
            },
          } as const,
        ]
      : []),
    ...(input.estimateMinutes === null
      ? []
      : [
          {
            type: "task.estimate.set",
            payload: { taskId: task.id, estimateMinutes: input.estimateMinutes },
          } as const,
        ]),
  ];
};

/**
An instance made ahead waits under "In future" until its issue: once its homework arrives it
has been given, so it starts now and shows on Now.
*/
const startedBodies = (task: Task, now: string): readonly EventBody[] =>
  task.startAt !== null && Date.parse(task.startAt) > Date.parse(now)
    ? [
        {
          type: "task.updated",
          payload: { taskId: task.id, startAt: now, startTz: task.startTz ?? "UTC" },
        } as const,
      ]
    : [];

/** The problems, the details and the message itself added to this week's homework. */
export const instanceBodies = (
  input: QuickInput,
  task: Task,
  { newId, now }: { readonly newId: Ids; readonly now: string },
): readonly EventBody[] => [
  ...startedBodies(task, now),
  ...subtasksAddedBodies(task.id, input.subtasks, () => newId()),
  ...detailBodies(input, task),
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
  const instance = openInstanceOf(world.state, input.presetId, {
    due: dueOfInput(input),
    now: world.now,
  });
  if (instance !== undefined) {
    return instanceBodies(input, instance, { newId, now: world.now });
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
        ...(input.description !== null && { description: input.description }),
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
