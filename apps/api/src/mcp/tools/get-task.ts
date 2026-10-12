import { z } from "zod";

import { err, ok, type TaskView, taskView } from "@pace/core";

import { defineTool } from "../registry.ts";
import { describeRow, type TaskRow, taskRow, TaskRowSchema } from "../rows.ts";
import { describeCode, type Rendered, runRead } from "../tool-kit.ts";

const SubtaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  number: z.int().nullable(),
  solvedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
});

const ClosedSchema = z.object({
  at: z.string(),
  confirmed: z.boolean(),
  eventId: z.string().describe("The closing event; revoke_event on it reopens the task."),
  outcome: z.string(),
  reason: z.string().nullable(),
  source: z.string(),
});

const SubmitPreviewSchema = z.object({
  canClose: z.boolean().optional(),
  kind: z
    .string()
    .describe("per_subtask: submit sends the solved problems; whole: submit closes the task."),
  subtaskIds: z.array(z.string()).optional(),
});

/** The task screen as structured data, with the row the list tools answer on top. */
const render = (view: TaskView, row: TaskRow): Rendered => {
  const { task } = view;
  return {
    structured: {
      ...row,
      closed: task.closed,
      createdAt: task.createdAt,
      description: task.description,
      overrides: task.overrides,
      slider: task.slider,
      sourceText: task.sourceText,
      startTz: task.startTz,
      submitPreview: view.submitPreview,
      subtasks: task.subtasks,
      workLeftMinutes: view.workLeftMinutes,
    },
    summary: [
      describeRow(row),
      `Status ${task.status}; progress ${Math.round(row.progress * 100)}%.`,
      ...(task.closed === null ? [] : [`Closed: ${task.closed.outcome} at ${task.closed.at}.`]),
      ...task.subtasks.map(
        (item) =>
          `- ${item.solvedAt === null ? "[ ]" : "[x]"} ${item.label} (${item.id})${item.submittedAt === null ? "" : " submitted"}`,
      ),
    ].join("\n"),
  };
};

export const taskTool = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
  description:
    "Everything about one task: its fields, subtasks with solved/submitted marks, the closure and derived outcome, progress, the work left and what submit would do next. Use it before mark_subtasks (to learn subtask ids and numbers), before submit, or to answer questions about a task's deadline.",
  handler: async (args, ctx) =>
    await runRead(ctx, (scope) => {
      const view = taskView(scope.state, args.id, scope.qctx);
      if (!view.ok) {
        return err({ code: view.error, message: describeCode(view.error) });
      }
      const row = taskRow(scope, args.id);
      return row.ok ? ok(render(view.value, row.value)) : row;
    }),
  input: { id: z.string().min(1).describe("The task id.") },
  name: "get_task",
  output: {
    ...TaskRowSchema.shape,
    closed: ClosedSchema.nullable(),
    createdAt: z.string(),
    description: z.string().nullable(),
    overrides: z.record(z.string(), z.unknown()).nullable(),
    slider: z.int().nullable(),
    sourceText: z.string().nullable(),
    startTz: z.string().nullable(),
    submitPreview: SubmitPreviewSchema,
    subtasks: z.array(SubtaskSchema),
    workLeftMinutes: z.int(),
  },
  scope: "tasks:read",
  title: "Get task",
});
