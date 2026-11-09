import { z } from "zod";

import { err, ok, type Result, type Subtask, type Task } from "@pace/core";

import { forTask, TASK_ID, WRITE_INPUT } from "../inputs.ts";
import { defineTool } from "../registry.ts";
import { renderTask, TaskRowSchema } from "../rows.ts";
import { describeCode, runWrite, stamp, type ToolFailure, WRITE_OUTPUT } from "../tool-kit.ts";

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
    "Marks subtasks done, by id (from get_task) or by problem number (homework: numbers: [3, 4]). Done is the one mark a subtask has, recorded with its instant (`at`, default now; use the past to record when it was really done). Already done ones are skipped and reported. The first mark moves the task to in_progress. Marking every subtask does not close the task: close_task with outcome done does (a revoke_event on a mark takes it back).",
  handler: async (args, ctx) => {
    const done: string[] = [];
    const alreadyDone: string[] = [];
    return await runWrite(ctx, args, {
      build: forTask(args.taskId, (_scope, when, task) => {
        // Core refuses marks on a closed task; an all-done selection would emit none and slip by.
        if (task.closed !== null) {
          return err({ code: "retro/task-closed", message: describeCode("retro/task-closed") });
        }
        const picked = selectSubtasks(task, args);
        if (!picked.ok) {
          return picked;
        }
        alreadyDone.push(
          ...picked.value.filter((item) => item.doneAt !== null).map((item) => item.id),
        );
        done.push(...picked.value.filter((item) => item.doneAt === null).map((item) => item.id));
        return ok(
          done.map((subtaskId) =>
            stamp(when, {
              payload: { subtaskId, taskId: args.taskId },
              type: "task.subtask.solved",
            }),
          ),
        );
      }),
      render: renderTask(
        args.taskId,
        `Marked ${done.length} done (${alreadyDone.length} already were) on`,
        { alreadyDone, done },
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
  output: {
    ...TASK_OUTPUT,
    alreadyDone: z.array(z.string()).describe("Subtask ids that were done already."),
    done: z.array(z.string()).describe("Subtask ids marked done by this call."),
  },
  scope: "tasks:write",
  title: "Mark subtasks done",
});

export const closeTask = defineTool({
  annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false },
  description:
    "Closes a task with an outcome: done (done_late is derived, never passed: when every subtask is done, by the latest done instant against the deadline, so problems solved in time and the task closed later stay on time; otherwise by the closing instant), cancelled (not needed any more; reason recommended) or skipped (consciously not done). A closed task keeps its history and can be reopened. Subtasks are marked done with mark_subtasks.",
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
    "Reopens a closed task (done, cancelled, skipped, or missed: a closure older versions made automatically), keeping its subtasks and history. To undo an automatic outcome instead, revoke its closing event (see list_review).",
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
