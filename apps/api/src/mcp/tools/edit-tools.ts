import { z } from "zod";

import {
  type CoreState,
  err,
  type EventInput,
  ok,
  rankWithinCategory,
  type Result,
  type Task,
  TaskStatusSchema,
} from "@pace/core";

import {
  IMPORTANCE,
  requireTask,
  SUBTASK_INPUT,
  TASK_ID,
  toSubtasks,
  WRITE_INPUT,
} from "../inputs.ts";
import { defineTool } from "../registry.ts";
import { effectiveImportance, labelOf, rowOf, TaskRowSchema } from "../rows.ts";
import {
  type Rendered,
  runWrite,
  type Scope,
  stamp,
  type ToolFailure,
  WRITE_OUTPUT,
} from "../tool-kit.ts";

const SETTER = { destructiveHint: false, idempotentHint: true, readOnlyHint: false };

const TASK_OUTPUT = { ...WRITE_OUTPUT, task: TaskRowSchema.nullable(), taskId: z.string() };

const renderTask =
  (taskId: string, verb: string) =>
  (scope: Scope): Rendered => {
    const row = rowOf(scope, taskId);
    return {
      structured: { task: row, taskId },
      summary: `${verb} ${labelOf(row, taskId)}.`,
    };
  };

export const importanceTool = defineTool({
  annotations: SETTER,
  description:
    "Sets a task's importance: asap (wants to be done today), prioritized (within about three days of being set), normal, nice_to_have. Setting it again restarts the prioritized horizon.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: (scope, when) => {
        const task = requireTask(scope.state, args.taskId);
        return task.ok
          ? ok([
              stamp(when, {
                payload: { importance: args.importance, taskId: args.taskId },
                type: "task.importance.set",
              }),
            ])
          : task;
      },
      render: renderTask(args.taskId, `Importance set to ${args.importance} on`),
    }),
  input: { ...WRITE_INPUT, taskId: TASK_ID, importance: IMPORTANCE },
  name: "set_importance",
  output: TASK_OUTPUT,
  scope: "tasks:write",
  title: "Set importance",
});

export const statusTool = defineTool({
  annotations: SETTER,
  description:
    "Sets a task's status: in_progress, paused, waiting (on someone else: its urgency freezes and the waiting time is counted) or not_started. Work on subtasks moves a task to in_progress by itself; use this for pauses and waiting.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: (scope, when) => {
        const task = requireTask(scope.state, args.taskId);
        return task.ok
          ? ok([
              stamp(when, {
                payload: { status: args.status, taskId: args.taskId },
                type: "task.status.set",
              }),
            ])
          : task;
      },
      render: renderTask(args.taskId, `Status set to ${args.status} on`),
    }),
  input: {
    ...WRITE_INPUT,
    taskId: TASK_ID,
    status: TaskStatusSchema.describe("not_started | in_progress | paused | waiting"),
  },
  name: "set_status",
  output: TASK_OUTPUT,
  scope: "tasks:write",
  title: "Set status",
});

type Member = { readonly task: Task; readonly position: number };

/** The open, competing tasks of the target's importance category in their current order. */
const categoryOf = (state: CoreState, target: Task): readonly Task[] => {
  const importance = effectiveImportance(state, target);
  return Object.values(state.tasks.byId)
    .flatMap((task): readonly Member[] => {
      const rank = rankWithinCategory(state, task);
      return rank === null || effectiveImportance(state, task) !== importance
        ? []
        : [{ position: rank.position, task }];
    })
    .toSorted((a, b) => a.position - b.position)
    .map((member) => member.task);
};

const reorder = (
  state: CoreState,
  target: Task,
  position: number,
): Result<readonly Task[], ToolFailure> => {
  const category = categoryOf(state, target);
  if (category.every((task) => task.id !== target.id)) {
    return err({ code: "rank/not-competing", message: `${target.title} has no rank` });
  }
  const others = category.filter((task) => task.id !== target.id);
  const index = Math.min(Math.max(position - 1, 0), others.length);
  return ok([...others.slice(0, index), target, ...others.slice(index)]);
};

export const rankTool = defineTool({
  annotations: SETTER,
  description:
    "Moves a task to a 1-based position among the open tasks of its importance category (asap, prioritized, normal or nice_to_have) and renumbers the whole category, as dragging on the Now list does. The rank adds a small bonus to the score, so it only orders tasks whose urgency is close. Returns the resulting order of ids.",
  handler: async (args, ctx) => {
    const order: string[] = [];
    return await runWrite(ctx, args, {
      build: (scope, when) => {
        const target = requireTask(scope.state, args.taskId);
        if (!target.ok) {
          return target;
        }
        const ordered = reorder(scope.state, target.value, args.position);
        if (!ordered.ok) {
          return ordered;
        }
        order.push(...ordered.value.map((task) => task.id));
        const events: readonly EventInput[] = ordered.value.flatMap((task, index) =>
          task.rank === index + 1
            ? []
            : [
                stamp(when, {
                  payload: { rank: index + 1, taskId: task.id },
                  type: "task.rank.set",
                }),
              ],
        );
        return ok(events);
      },
      render: () => ({
        structured: { order, position: order.indexOf(args.taskId) + 1, taskId: args.taskId },
        summary: `Moved to position ${order.indexOf(args.taskId) + 1} of ${order.length}.`,
      }),
    });
  },
  input: {
    ...WRITE_INPUT,
    taskId: TASK_ID,
    position: z.int().min(1).describe("1 = first in its category."),
  },
  name: "set_rank",
  output: { ...WRITE_OUTPUT, order: z.array(z.string()), position: z.int(), taskId: z.string() },
  scope: "tasks:write",
  title: "Set rank",
});

const AddedSchema = z.object({ id: z.string(), label: z.string(), number: z.int().nullable() });

export const subtasksTool = defineTool({
  annotations: { destructiveHint: false, idempotentHint: false, readOnlyHint: false },
  description:
    "Appends subtasks (problems, steps) to a task: labels like '5', '6' or 'write the intro', or { label, number }. A bare number label becomes the problem number. Returns the new subtasks with their ids for mark_subtasks.",
  handler: async (args, ctx) => {
    const subtasks = toSubtasks(args.labels);
    return await runWrite(ctx, args, {
      build: (scope, when) => {
        const task = requireTask(scope.state, args.taskId);
        return task.ok
          ? ok([
              stamp(when, {
                payload: { subtasks: [...subtasks], taskId: args.taskId },
                type: "task.subtasks.added",
              }),
            ])
          : task;
      },
      render: (scope) => {
        const row = rowOf(scope, args.taskId);
        return {
          structured: {
            added: subtasks.map((item) => ({
              id: item.id,
              label: item.label,
              number: item.number ?? null,
            })),
            task: row,
            taskId: args.taskId,
          },
          summary: `Added ${subtasks.length} subtask(s) to ${labelOf(row, args.taskId)}.`,
        };
      },
    });
  },
  input: {
    ...WRITE_INPUT,
    taskId: TASK_ID,
    labels: z.array(SUBTASK_INPUT).min(1).describe("The subtasks to add, in order."),
  },
  name: "add_subtasks",
  output: { ...TASK_OUTPUT, added: z.array(AddedSchema) },
  scope: "tasks:write",
  title: "Add subtasks",
});
