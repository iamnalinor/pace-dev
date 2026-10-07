import { z } from "zod";

import {
  err,
  type EventInput,
  ok,
  type Result,
  type SubmitPreview,
  type Subtask,
  type Task,
  taskById,
  taskView,
  unsubmittedSubtasks,
} from "@pace/core";

import { forTask, TASK_ID, WRITE_INPUT } from "../inputs.ts";
import { defineTool } from "../registry.ts";
import { labelOf, renderTask, rowOf, TaskRowSchema } from "../rows.ts";
import {
  describeCode,
  runWrite,
  type Scope,
  stamp,
  type ToolFailure,
  type When,
  WRITE_OUTPUT,
} from "../tool-kit.ts";

const TASK_OUTPUT = { ...WRITE_OUTPUT, task: TaskRowSchema.nullable(), taskId: z.string() };

type Selection = {
  readonly subtaskIds?: readonly string[] | undefined;
  readonly numbers?: readonly number[] | undefined;
};

const unknownSubtask = (what: string): ToolFailure => ({
  code: "subtask/unknown",
  message: `No subtask ${what} on this task`,
});

/** The subtasks a call names, by id or by problem number; every one must exist. */
const selectSubtasks = (
  task: Task,
  selection: Selection,
): Result<readonly Subtask[], ToolFailure> => {
  if (selection.subtaskIds !== undefined) {
    const picked = selection.subtaskIds.map((id) => task.subtasks.find((item) => item.id === id));
    const missing = selection.subtaskIds.find((_id, index) => picked[index] === undefined);
    return missing === undefined
      ? ok(picked.filter((item): item is Subtask => item !== undefined))
      : err(unknownSubtask(`with id ${missing}`));
  }
  if (selection.numbers !== undefined) {
    const picked = selection.numbers.map((number) =>
      task.subtasks.find((item) => item.number === number),
    );
    const missing = selection.numbers.find((_number, index) => picked[index] === undefined);
    return missing === undefined
      ? ok(picked.filter((item): item is Subtask => item !== undefined))
      : err(unknownSubtask(`number ${missing}`));
  }
  return err({ code: "subtask/unknown", message: "Give subtaskIds or numbers" });
};

export const markSubtasks = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
  description:
    "Marks subtasks as solved, by id (from get_task) or by problem number (homework: numbers: [3, 4]). Solved is not submitted: call submit to send them. Already solved ones are skipped and reported. The first solve moves the task to in_progress.",
  handler: async (args, ctx) => {
    const solved: string[] = [];
    const alreadySolved: string[] = [];
    return await runWrite(ctx, args, {
      build: forTask(args.taskId, (_scope, when, task) => {
        // Core refuses solves on a closed task; an all-solved selection would emit none and slip by.
        if (task.closed !== null) {
          return err({ code: "retro/task-closed", message: describeCode("retro/task-closed") });
        }
        const picked = selectSubtasks(task, args);
        if (!picked.ok) {
          return picked;
        }
        alreadySolved.push(
          ...picked.value.filter((item) => item.solvedAt !== null).map((item) => item.id),
        );
        solved.push(
          ...picked.value.filter((item) => item.solvedAt === null).map((item) => item.id),
        );
        return ok(
          solved.map((subtaskId) =>
            stamp(when, {
              payload: { subtaskId, taskId: args.taskId },
              type: "task.subtask.solved",
            }),
          ),
        );
      }),
      render: renderTask(
        args.taskId,
        `Marked ${solved.length} solved (${alreadySolved.length} already were) on`,
        {
          alreadySolved,
          solved,
        },
      ),
    });
  },
  input: {
    ...WRITE_INPUT,
    taskId: TASK_ID,
    subtaskIds: z.array(z.string().min(1)).min(1).optional().describe("Subtask ids to mark."),
    numbers: z
      .array(z.int().min(0))
      .min(1)
      .optional()
      .describe("Problem numbers to mark (homework)."),
  },
  name: "mark_subtasks",
  output: { ...TASK_OUTPUT, alreadySolved: z.array(z.string()), solved: z.array(z.string()) },
  scope: "tasks:write",
  title: "Mark subtasks solved",
});

type Submission = {
  readonly event: EventInput;
  readonly subtaskIds: readonly string[];
};

type SubmitRequest = {
  readonly task: Task;
  /** The subtasks the caller named; the preview's solved, unsubmitted ones otherwise. */
  readonly ids: readonly string[] | undefined;
  readonly when: When;
};

/**
What the task screen's Submit button does (core's submit preview): per-subtask presets send
the solved, unsubmitted problems and close the task with the last of them; whole-submission
presets submit and close at once.
*/
const submission = (
  preview: SubmitPreview,
  { task, ids, when }: SubmitRequest,
): Result<Submission, ToolFailure> => {
  if (preview.kind === "whole") {
    return ok({
      event: stamp(when, { payload: { closes: true, taskId: task.id }, type: "task.submitted" }),
      subtaskIds: [],
    });
  }
  const subtaskIds = ids ?? preview.subtaskIds;
  if (subtaskIds.length === 0) {
    return err({ code: "retro/nothing-to-submit", message: "No solved, unsubmitted subtasks" });
  }
  const isLast = unsubmittedSubtasks(task).every((item) => subtaskIds.includes(item.id));
  return ok({
    event: stamp(when, {
      payload: { closes: isLast, subtaskIds: [...subtaskIds], taskId: task.id },
      type: "task.submitted",
    }),
    subtaskIds,
  });
};

const submitting = (scope: Scope, request: SubmitRequest): Result<Submission, ToolFailure> => {
  const view = taskView(scope.state, request.task.id, scope.qctx);
  return view.ok
    ? submission(view.value.submitPreview, request)
    : err({ code: view.error, message: describeCode(view.error) });
};

export const submit = defineTool({
  annotations: { destructiveHint: false, idempotentHint: false, readOnlyHint: false },
  description:
    "Submits work. For a per-subtask preset (homework) it sends the solved, unsubmitted problems (or only subtaskIds) and closes the task as done when the last unsubmitted problem goes; for a whole-submission preset (work, personal) it submits and closes the task as done. Solved problems must exist first (mark_subtasks). Use close_task for cancelled or skipped.",
  handler: async (args, ctx) => {
    const sent: string[] = [];
    return await runWrite(ctx, args, {
      build: forTask(args.taskId, (scope, when, task) => {
        const built = submitting(scope, { ids: args.subtaskIds, task, when });
        if (!built.ok) {
          return built;
        }
        sent.push(...built.value.subtaskIds);
        return ok([built.value.event]);
      }),
      render: (scope) => {
        const row = rowOf(scope, args.taskId);
        const isClosed = taskById(scope.state.tasks, args.taskId)?.closed !== null;
        const what = sent.length === 0 ? "the task" : `${sent.length} subtask(s)`;
        return {
          structured: {
            closed: isClosed,
            submittedSubtaskIds: sent,
            task: row,
            taskId: args.taskId,
          },
          summary: `Submitted ${what}${isClosed ? " and closed" : ""}: ${labelOf(row, args.taskId)}.`,
        };
      },
    });
  },
  input: {
    ...WRITE_INPUT,
    taskId: TASK_ID,
    subtaskIds: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe("Only these solved subtasks."),
  },
  name: "submit",
  output: { ...TASK_OUTPUT, closed: z.boolean(), submittedSubtaskIds: z.array(z.string()) },
  scope: "tasks:write",
  title: "Submit",
});

export const closeTask = defineTool({
  annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false },
  description:
    "Closes a task with an outcome: done (done_late is derived when it is past the deadline), cancelled (not needed any more; reason recommended) or skipped (consciously not done). A closed task keeps its history and can be reopened. For sending homework problems use submit.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: forTask(args.taskId, (_scope, when) =>
        ok([
          stamp(when, {
            payload: { outcome: args.outcome, reason: args.reason, taskId: args.taskId },
            type: "task.closed",
          }),
        ]),
      ),
      render: renderTask(args.taskId, `Closed as ${args.outcome}:`, { outcome: args.outcome }),
    }),
  input: {
    ...WRITE_INPUT,
    taskId: TASK_ID,
    outcome: z.enum(["done", "cancelled", "skipped"]),
    reason: z
      .string()
      .min(1)
      .optional()
      .describe("Why, in the person's words (cancelled/skipped)."),
  },
  name: "close_task",
  output: { ...TASK_OUTPUT, outcome: z.string() },
  scope: "tasks:write",
  title: "Close task",
});

export const reopen = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
  description:
    "Reopens a closed task (done, cancelled, skipped or automatically missed), keeping its subtasks and history. To undo an automatic outcome instead, revoke its closing event (see list_review).",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: forTask(args.taskId, (_scope, when) =>
        ok([stamp(when, { payload: { taskId: args.taskId }, type: "task.reopened" })]),
      ),
      render: renderTask(args.taskId, "Reopened"),
    }),
  input: { ...WRITE_INPUT, taskId: TASK_ID },
  name: "reopen",
  output: TASK_OUTPUT,
  scope: "tasks:write",
  title: "Reopen task",
});
