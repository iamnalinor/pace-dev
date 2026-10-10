import { z } from "zod";

import { ok } from "@pace/core";

import { forTask, IMPORTANCE, SUBTASK_INPUT, TASK_ID, toSubtasks, WRITE_INPUT } from "../inputs.ts";
import { defineTool } from "../registry.ts";
import { labelOf, renderTask, rowOf, TaskRowSchema } from "../rows.ts";
import { runWrite, stamp, WRITE_OUTPUT } from "../tool-kit.ts";

const SETTER = { destructiveHint: false, idempotentHint: true, readOnlyHint: false };

const TASK_OUTPUT = { ...WRITE_OUTPUT, task: TaskRowSchema.nullable(), taskId: z.string() };

export const importanceTool = defineTool({
  annotations: SETTER,
  description:
    "Sets a task's importance, the label shown after its project: asap, prioritized, normal, nice_to_have. It does not change the order: Now is sorted by deadline.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: forTask(args.taskId, (_scope, when) =>
        ok([
          stamp(when, {
            payload: { importance: args.importance, taskId: args.taskId },
            type: "task.importance.set",
          }),
        ]),
      ),
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
    "Sets a task's status: in_progress, paused or not_started. Work on subtasks moves a task to in_progress by itself; use this for pauses.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: forTask(args.taskId, (_scope, when) =>
        ok([
          stamp(when, {
            payload: { status: args.status, taskId: args.taskId },
            type: "task.status.set",
          }),
        ]),
      ),
      render: renderTask(args.taskId, `Status set to ${args.status} on`),
    }),
  input: {
    ...WRITE_INPUT,
    taskId: TASK_ID,
    status: z
      .enum(["not_started", "in_progress", "paused"])
      .describe("not_started | in_progress | paused"),
  },
  name: "set_status",
  output: TASK_OUTPUT,
  scope: "tasks:write",
  title: "Set status",
});

const AddedSchema = z.object({ id: z.string(), label: z.string(), number: z.int().nullable() });

export const subtasksTool = defineTool({
  annotations: { destructiveHint: false, idempotentHint: false, readOnlyHint: false },
  description:
    "Appends subtasks (problems, steps) to a task: labels like '5', '6' or 'write the intro', or { label, number }. A bare number label becomes the problem number. Returns the new subtasks with their ids for mark_subtasks.",
  handler: async (args, ctx) => {
    const subtasks = toSubtasks(args.labels);
    return await runWrite(ctx, args, {
      build: forTask(args.taskId, (_scope, when) =>
        ok([
          stamp(when, {
            payload: { subtasks: [...subtasks], taskId: args.taskId },
            type: "task.subtasks.added",
          }),
        ]),
      ),
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
