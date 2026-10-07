import { z } from "zod";

import { err, ok, taskView } from "@pace/core";

import { defineTool } from "../registry.ts";
import { describeRow, rowFromView, TaskRowSchema } from "../rows.ts";
import { describeCode, runRead } from "../tool-kit.ts";

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

const ExplainInputSchema = z.object({
  key: z.string(),
  unit: z.string().optional(),
  value: z.union([z.null(), z.number(), z.string()]),
});

const ExplainStepSchema = z.object({ key: z.string(), value: z.number() });

const ExplanationSchema = z.object({
  formula: z.string(),
  inputs: z.array(ExplainInputSchema),
  policy: z.string(),
  steps: z.array(ExplainStepSchema),
});

const SubmitPreviewSchema = z.object({
  canClose: z.boolean().optional(),
  kind: z
    .string()
    .describe("per_subtask: submit sends the solved problems; whole: submit closes the task."),
  subtaskIds: z.array(z.string()).optional(),
});

export const taskTool = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
  description:
    "Everything about one task: its fields, subtasks with solved/submitted marks, the closure and derived outcome, progress, how much of its time window has elapsed, the work left, the 'why it is ranked here' explanation (policy, formula, inputs, steps) and what submit would do next. Use it before mark_subtasks (to learn subtask ids and numbers), before submit, or to answer questions about a task's deadline and urgency.",
  handler: async (args, ctx) =>
    await runRead(ctx, (scope) => {
      const view = taskView(scope.state, args.id, scope.qctx);
      if (!view.ok) {
        return err({ code: view.error, message: describeCode(view.error) });
      }
      const { task, explanation } = view.value;
      const row = rowFromView(scope, view.value);
      return ok({
        structured: {
          ...row,
          closed: task.closed,
          createdAt: task.createdAt,
          description: task.description,
          explanation: {
            formula: explanation.formula,
            inputs: explanation.inputs,
            policy: explanation.policy,
            steps: explanation.steps,
          },
          overrides: task.overrides,
          rank: view.value.rank,
          slider: task.slider,
          sourceText: task.sourceText,
          startTz: task.startTz,
          submitPreview: view.value.submitPreview,
          subtasks: task.subtasks,
          waitingMinutes: task.waitingMinutes,
          windowElapsed: view.value.windowElapsed,
          workLeftMinutes: view.value.workLeftMinutes,
        },
        summary: [
          describeRow(row),
          `Status ${task.status}; progress ${Math.round(row.progress * 100)}%; score ${row.score.toFixed(2)} (${explanation.policy}).`,
          ...(task.closed === null ? [] : [`Closed: ${task.closed.outcome} at ${task.closed.at}.`]),
          ...task.subtasks.map(
            (item) =>
              `- ${item.solvedAt === null ? "[ ]" : "[x]"} ${item.label} (${item.id})${item.submittedAt === null ? "" : " submitted"}`,
          ),
        ].join("\n"),
      });
    }),
  input: { id: z.string().min(1).describe("The task id.") },
  name: "get_task",
  output: {
    ...TaskRowSchema.shape,
    closed: ClosedSchema.nullable(),
    createdAt: z.string(),
    description: z.string().nullable(),
    explanation: ExplanationSchema,
    overrides: z.record(z.string(), z.unknown()).nullable(),
    rank: z.object({ position: z.int(), size: z.int() }).nullable(),
    slider: z.int().nullable(),
    sourceText: z.string().nullable(),
    startTz: z.string().nullable(),
    submitPreview: SubmitPreviewSchema,
    subtasks: z.array(SubtaskSchema),
    waitingMinutes: z.number(),
    windowElapsed: z.number().nullable(),
    workLeftMinutes: z.int(),
  },
  scope: "tasks:read",
  title: "Get task",
});
