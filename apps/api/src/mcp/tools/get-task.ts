import { z } from "zod";

import { err, ok, type Task, type TaskView, taskView } from "@pace/core";

import { defineTool } from "../registry.ts";
import { describeRow, type TaskRow, taskRow, TaskRowSchema } from "../rows.ts";
import { describeCode, type Rendered, runRead } from "../tool-kit.ts";

const SubtaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  number: z.int().nullable(),
  doneAt: z
    .string()
    .nullable()
    .describe(
      "When it was done (its one mark); null while open. Old solved/sent marks read as done at the earlier one.",
    ),
});

const ClosedSchema = z.object({
  at: z.string(),
  confirmed: z.boolean(),
  eventId: z.string().describe("The closing event; revoke_event on it reopens the task."),
  outcome: z.string(),
  reason: z.string().nullable(),
  source: z.string(),
});

/**
Every field of the task projection that the row does not already carry (feedback 5: the answer
is the whole task, not a subset). Typed against `Task`, so a field added to the projection fails
the type check until it is answered here too. The task's own importance is `ownImportance`: the
row's `importance` is the effective one.
*/
const TASK_FIELDS = {
  createdEventId: z.string().describe("The task.created event; revoking it deletes the task."),
  seriesId: z.string().nullable().describe("The repeat series it belongs to, if any."),
  seriesRevision: z.int().nullable(),
  userModified: z.boolean().describe("A series instance the person edited keeps its own fields."),
  ownImportance: z
    .string()
    .nullable()
    .describe("The importance set on the task; null = the preset default."),
  importanceSetAt: z.string().nullable(),
  startTz: z.string().nullable(),
  subtasks: z.array(SubtaskSchema),
  slider: z.int().nullable().describe("Progress slider 0..10; null when never moved."),
  description: z.string().nullable(),
  sourceText: z.string().nullable(),
  sources: z.array(z.object({ at: z.string(), text: z.string(), url: z.string().nullable() })),
  fields: z.object({ link: z.string().nullable(), submitVia: z.string().nullable() }),
  overrides: z.record(z.string(), z.unknown()).nullable(),
  statusSince: z.string(),
  touched: z.boolean().describe("Work was done on it at some point."),
  createdAt: z.string(),
  submittedAt: z.string().nullable().describe("A whole-task submission an older version recorded."),
  closed: ClosedSchema.nullable(),
  reopenedAt: z.string().nullable(),
  lastEventAt: z.string(),
} satisfies Record<"ownImportance" | Exclude<keyof Task, "importance" | keyof TaskRow>, z.ZodType>;

/** " done <instant>" after a done subtask's line; nothing while it is open. */
const doneNote = (doneAt: null | string): string => (doneAt === null ? "" : ` done ${doneAt}`);

/** The task screen as structured data: the whole projection, with the row the list tools answer. */
const render = (view: TaskView, row: TaskRow): Rendered => {
  const { importance: ownImportance, ...task } = view.task;
  const structured = {
    ...task,
    ...row,
    ownImportance,
    workLeftMinutes: view.workLeftMinutes,
  };
  return {
    structured,
    summary: [
      describeRow(row),
      `Status ${task.status}; progress ${Math.round(row.progress * 100)}%.`,
      ...(task.closed === null ? [] : [`Closed: ${task.closed.outcome} at ${task.closed.at}.`]),
      ...task.subtasks.map(
        (item) =>
          `- ${item.doneAt === null ? "[ ]" : "[x]"} ${item.label} (${item.id})${doneNote(item.doneAt)}`,
      ),
      // The whole task as data: a client that shows only the text still sees every field.
      `Fields: ${JSON.stringify(structured)}`,
    ].join("\n"),
  };
};

export const taskTool = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
  description:
    "Everything about one task: every field the store keeps (start and its zone, estimate, own and effective importance, description, link, sources, series, status history), its subtasks with their done marks, the closure and derived outcome, progress and the work left. The text answer carries the same fields as JSON. Use it before mark_subtasks (to learn subtask ids and numbers) or to answer questions about a task.",
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
    ...TASK_FIELDS,
    workLeftMinutes: z.int(),
  },
  scope: "tasks:read",
  title: "Get task",
});
