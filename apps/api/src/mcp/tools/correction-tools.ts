import { z } from "zod";

import { err, ok, reviewItems } from "@pace/core";

import { forTask, TASK_ID, WRITE_INPUT } from "../inputs.ts";
import { defineTool } from "../registry.ts";
import { labelOf, rowOf, TaskRowSchema } from "../rows.ts";
import { failure, runWrite, stamp, WRITE_OUTPUT } from "../tool-kit.ts";

export const revokeEvent = defineTool({
  annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false },
  description:
    "Revokes one event by id (a solve, a submission, a closure, an automatic outcome, an edit): the log keeps it, but the state is rebuilt as if it never happened. This is the undo of Pace. Event ids come from the `events` of every mutating tool and from get_task (closed.eventId). Revoking a revocation restores the original.",
  handler: async (args, ctx) => {
    const target = await ctx.store.find(args.eventId);
    if (target === undefined) {
      return failure("event/not-found");
    }
    return await runWrite(ctx, args, {
      build: (_scope, when) =>
        ok([
          stamp(when, {
            payload: { reason: args.reason, targetId: args.eventId },
            type: "event.revoked",
          }),
        ]),
      render: () => ({
        structured: { targetId: target.id, targetType: target.type },
        summary: `Revoked ${target.type} ${target.id}.`,
      }),
    });
  },
  input: {
    ...WRITE_INPUT,
    eventId: z.string().min(1).describe("The id of the event to undo."),
    reason: z.string().min(1).optional(),
  },
  name: "revoke_event",
  output: { ...WRITE_OUTPUT, targetId: z.string(), targetType: z.string() },
  scope: "tasks:write",
  title: "Revoke event",
});

const ACTION_KEYS = [
  "cancel",
  "confirm",
  "keep-open",
  "mark-done",
  "skip",
  "sort",
  "submit-now",
  "undo",
] as const;

export const reviewAction = defineTool({
  annotations: { destructiveHint: true, idempotentHint: true, readOnlyHint: false },
  description:
    "Runs one of the actions a review item offers (see list_review): submit-now / mark-done / keep-open for a task that looks finished, mark-done / cancel / skip / keep-open for a passed deadline, sort / cancel for an old inbox item, confirm / undo for an automatic outcome. keep-open records nothing.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: forTask(args.taskId, (scope, when, task) => {
        const item = reviewItems(scope.state, scope.qctx).find(
          (entry) => entry.taskId === args.taskId,
        );
        if (item === undefined) {
          return err({ code: "review/no-item", message: `Nothing to review for ${task.title}` });
        }
        const action = item.actions.find((candidate) => candidate.key === args.key);
        return action === undefined
          ? err({
              code: "review/no-action",
              message: `This ${item.kind} item offers ${item.actions.map((candidate) => candidate.key).join(", ")}`,
            })
          : ok(
              action.events.map((event) => ({
                ...event,
                occurredAt: when.at,
                precision: when.precision,
                source: "mcp" as const,
              })),
            );
      }),
      render: (scope, events) => {
        const row = rowOf(scope, args.taskId);
        return {
          structured: { applied: events.length > 0, key: args.key, task: row, taskId: args.taskId },
          summary:
            events.length === 0
              ? `${args.key}: nothing to record.`
              : `${args.key} applied to ${labelOf(row, args.taskId)}.`,
        };
      },
    }),
  input: { ...WRITE_INPUT, taskId: TASK_ID, key: z.enum(ACTION_KEYS) },
  name: "review_action",
  output: {
    ...WRITE_OUTPUT,
    applied: z.boolean(),
    key: z.string(),
    task: TaskRowSchema.nullable(),
    taskId: z.string(),
  },
  scope: "tasks:write",
  title: "Review action",
});
