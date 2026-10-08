import { z } from "zod";

import {
  ACTIVITY_CATEGORIES,
  type ActivityButton,
  type ActivityCategory,
  defaultsFor,
  effectiveButtons,
  err,
  newId,
  ok,
  runningActivity,
} from "@pace/core";

import { WRITE_INPUT } from "../inputs.ts";
import { defineTool } from "../registry.ts";
import { runWrite, type Scope, stamp, WRITE_OUTPUT } from "../tool-kit.ts";

const WRITE = { destructiveHint: false, idempotentHint: false, readOnlyHint: false };

const CATEGORY = z.enum(ACTIVITY_CATEGORIES);

const MINUTES = z.number().int().min(1).max(1440);

type StartArgs = {
  readonly buttonId?: string | undefined;
  readonly label?: string | undefined;
  readonly category?: ActivityCategory | undefined;
  readonly taskId?: string | undefined;
  readonly expectMinutes?: number | undefined;
  readonly limitMinutes?: number | undefined;
};

const buttonOf = (scope: Scope, buttonId: string | undefined): ActivityButton | undefined =>
  buttonId === undefined
    ? undefined
    : effectiveButtons(scope.state.time).find((button) => button.id === buttonId);

/** The label and category the call names, else the button's; `null` without a label. */
const nameOf = (args: StartArgs, button: ActivityButton | undefined) => {
  const label = (args.label ?? button?.label ?? "").trim();
  return label === "" ? null : { category: args.category ?? button?.category ?? "other", label };
};

/** Expect, Limit and task: the call's, else the button's, else what past runs of the label suggest. */
type Named = {
  readonly args: StartArgs;
  readonly button: ActivityButton | undefined;
  readonly name: { readonly label: string; readonly category: ActivityCategory };
};

const targetsOf = (scope: Scope, { args, button, name }: Named) => {
  const learned = defaultsFor(scope.state.time, name);
  return {
    expectMinutes: args.expectMinutes ?? button?.expectMinutes ?? learned.expectMinutes,
    limitMinutes: args.limitMinutes ?? button?.limitMinutes ?? learned.limitMinutes,
    taskId: args.taskId ?? button?.taskId ?? null,
  };
};

/** What starts: a button's defaults, overridden by whatever the call names. */
const startPayload = (scope: Scope, args: StartArgs, activityId: string) => {
  const button = buttonOf(scope, args.buttonId);
  if (button === undefined && args.buttonId !== undefined) {
    return err({
      code: "button/unknown",
      message: "No button with this id (see list_activity_buttons).",
    });
  }
  const name = nameOf(args, button);
  if (name === null) {
    return err({
      code: "activity/no-label",
      message: "Name the activity (label) or pick a button.",
    });
  }
  const { expectMinutes, limitMinutes, taskId } = targetsOf(scope, { args, button, name });
  return ok({
    activityId,
    ...name,
    ...(button !== undefined && { buttonId: button.id }),
    ...(taskId !== null && { taskId }),
    ...(expectMinutes !== null && { expectMinutes }),
    ...(limitMinutes !== null && { limitMinutes }),
  });
};

/** Starts an activity now (or at `at`); whatever was running ends there. */
export const startActivity = defineTool({
  annotations: WRITE,
  description:
    "Starts tracking an activity (what the person is doing now); the activity running until then ends at the same instant. Give a buttonId from list_activity_buttons to use that button's label, category and Expect/Limit, or a label and a category. taskId links the time to a task (it counts as work on it). `at` records a start in the past.",
  handler: async (args, ctx) => {
    const activityId = newId();
    return await runWrite(ctx, args, {
      build: (scope, when) => {
        const payload = startPayload(scope, args, activityId);
        return payload.ok
          ? ok([stamp(when, { payload: payload.value, type: "activity.started" })])
          : payload;
      },
      render: () => ({ structured: { activityId }, summary: `Started ${activityId}.` }),
    });
  },
  input: {
    ...WRITE_INPUT,
    buttonId: z.string().optional().describe("A button id from list_activity_buttons."),
    category: CATEGORY.optional(),
    expectMinutes: MINUTES.optional().describe(
      "How long it usually takes; past it, it counts as long.",
    ),
    label: z.string().trim().min(1).max(80).optional(),
    limitMinutes: MINUTES.optional().describe(
      "The most it may take; a reminder is sent at the limit.",
    ),
    taskId: z.string().optional(),
  },
  name: "start_activity",
  output: { ...WRITE_OUTPUT, activityId: z.string() },
  scope: "time:write",
  title: "Start activity",
});

/** Stops the activity running at `at` (default now). */
export const stopActivity = defineTool({
  annotations: WRITE,
  description:
    "Stops the activity that is running (at `at`, default now). Fails with activity/none-running when nothing runs.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: (scope, when) => {
        const running = runningActivity(scope.state.time, when.at);
        return running === null
          ? err({ code: "activity/none-running", message: "Nothing is running." })
          : ok([stamp(when, { payload: { activityId: running.id }, type: "activity.stopped" })]);
      },
      render: () => ({ structured: {}, summary: "Stopped." }),
    }),
  input: { ...WRITE_INPUT },
  name: "stop_activity",
  output: { ...WRITE_OUTPUT },
  scope: "time:write",
  title: "Stop activity",
});

/** Records a block that already happened; it wins over live time it overlaps. */
export const logActivity = defineTool({
  annotations: WRITE,
  description:
    "Records a past block of time (startAt..endAt, ISO 8601 UTC) with a label and a category, e.g. a lecture that was not tracked live. It takes precedence over live tracking it overlaps. taskId links it to a task.",
  handler: async (args, ctx) => {
    const activityId = newId();
    return await runWrite(
      ctx,
      { ...args, at: args.endAt },
      {
        build: (_scope, when) =>
          Date.parse(args.endAt) <= Date.parse(args.startAt)
            ? err({ code: "activity/bad-range", message: "endAt must be after startAt." })
            : ok([
                stamp(when, {
                  payload: {
                    activityId,
                    category: args.category,
                    endAt: args.endAt,
                    label: args.label,
                    startAt: args.startAt,
                    ...(args.taskId !== undefined && { taskId: args.taskId }),
                  },
                  type: "activity.logged",
                }),
              ]),
        render: () => ({ structured: { activityId }, summary: `Logged ${activityId}.` }),
      },
    );
  },
  input: {
    category: CATEGORY,
    dryRun: WRITE_INPUT.dryRun,
    endAt: z.iso.datetime(),
    label: z.string().trim().min(1).max(80),
    startAt: z.iso.datetime(),
    taskId: z.string().optional(),
  },
  name: "log_activity",
  output: { ...WRITE_OUTPUT, activityId: z.string() },
  scope: "time:write",
  title: "Log activity",
});
