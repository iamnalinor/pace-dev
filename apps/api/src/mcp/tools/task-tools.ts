import { z } from "zod";

import { accountTz, err, type EventInput, newId, ok } from "@pace/core";

import {
  forTask,
  IMPORTANCE,
  PROJECT_REF,
  resolveProject,
  SUBTASK_INPUT,
  TASK_ID,
  TIME_ZONE,
  toSubtasks,
  WRITE_INPUT,
  zonedPayload,
} from "../inputs.ts";
import { defineTool } from "../registry.ts";
import { describeRow, labelOf, rowOf, TaskRowSchema } from "../rows.ts";
import { runWrite, stamp, type When, WRITE_OUTPUT } from "../tool-kit.ts";

const WRITE = { destructiveHint: false, idempotentHint: false, readOnlyHint: false };

const ZONED_INPUT = {
  dueAt: z.iso.datetime().optional().describe("Deadline as an ISO instant (UTC)."),
  dueTz: TIME_ZONE.optional().describe(
    "Zone the deadline was set in; defaults to the account zone.",
  ),
  startAt: z.iso.datetime().optional().describe("Hidden from Now until this instant."),
  startTz: TIME_ZONE.optional(),
};

const DEFAULT_PRESET = "personal";

export const taskCreation = defineTool({
  annotations: WRITE,
  description:
    "Creates a task. presetId picks the behaviour (hw: numbered problems submitted per problem; work: progress slider, ticket; personal (default); deferred: someday) — see list_presets for the user's own course presets. A project is attached by id or by name (a new name creates the project). Subtasks are labels ('3', '4', 'read chapter 2') or { label, number }; a bare number label becomes the problem number. dueAt needs its zone (dueTz, default the account zone). Returns the task as it appears on Now. Set dryRun to preview.",
  handler: async (args, ctx) => {
    const taskId = newId();
    return await runWrite(ctx, args, {
      build: (scope, when) => {
        const project = resolveProject(scope.state, args, when);
        if (!project.ok) {
          return project;
        }
        const created: EventInput = stamp(when, {
          payload: {
            ...zonedPayload(args, accountTz(scope.state, scope.qctx)),
            description: args.description,
            estimateMinutes: args.estimateMinutes,
            fields: {},
            importance: args.importance,
            presetId: args.presetId ?? DEFAULT_PRESET,
            projectId: project.value.projectId,
            sourceText: args.sourceText,
            subtasks: [...toSubtasks(args.subtasks ?? [])],
            taskId,
            title: args.title.trim(),
          },
          type: "task.created",
        });
        return ok([...project.value.events, created]);
      },
      render: (scope) => {
        const row = rowOf(scope, taskId);
        return {
          structured: { projectId: row?.projectId ?? null, task: row, taskId },
          summary: row === null ? `Created task ${taskId}.` : `Created ${describeRow(row)}.`,
        };
      },
    });
  },
  input: {
    ...WRITE_INPUT,
    title: z.string().min(1).describe("The task title, as the person phrased it."),
    presetId: z.string().min(1).optional().describe('Preset id; defaults to "personal".'),
    ...PROJECT_REF,
    importance: IMPORTANCE.optional(),
    ...ZONED_INPUT,
    estimateMinutes: z.int().min(0).optional(),
    subtasks: z.array(SUBTASK_INPUT).optional().describe("Problems or steps, in order."),
    description: z.string().optional(),
    sourceText: z.string().optional().describe("The original text the task came from, verbatim."),
  },
  name: "create_task",
  output: {
    ...WRITE_OUTPUT,
    projectId: z.string().nullable(),
    task: TaskRowSchema.nullable(),
    taskId: z.string(),
  },
  scope: "tasks:write",
  title: "Create task",
});

export const captureInbox = defineTool({
  annotations: WRITE,
  description:
    "Saves a text to the inbox exactly as given, to be sorted later (list_inbox suggests a preset, project and due date). Use it when the person wants to jot something down without deciding what it is yet; use create_task when the task is clear.",
  handler: async (args, ctx) => {
    const taskId = newId();
    const text = args.text.trim();
    return await runWrite(ctx, args, {
      build: (_scope, when) => {
        const title = text
          .split("\n")
          .find((part) => part.trim() !== "")
          ?.trim();
        return title === undefined
          ? err({ code: "inbox/empty", message: "The text is empty." })
          : ok([
              stamp(when, {
                payload: {
                  fields: {},
                  presetId: "inbox",
                  sourceText: text,
                  subtasks: [],
                  taskId,
                  title,
                },
                type: "task.created",
              }),
            ]);
      },
      render: () => ({
        structured: { taskId },
        summary: `Captured to the inbox as ${taskId}.`,
      }),
    });
  },
  input: { ...WRITE_INPUT, text: z.string().min(1).describe("The text to capture, verbatim.") },
  name: "capture_inbox",
  output: { ...WRITE_OUTPUT, taskId: z.string() },
  scope: "tasks:write",
  title: "Capture to inbox",
});

type UpdateArgs = {
  readonly taskId: string;
  readonly title?: string | undefined;
  readonly description?: null | string | undefined;
  readonly dueAt?: string | undefined;
  readonly dueTz?: string | undefined;
  readonly startAt?: string | undefined;
  readonly startTz?: string | undefined;
  readonly estimateMinutes?: null | number | undefined;
  readonly presetId?: string | undefined;
};

const hasFieldChange = (args: UpdateArgs): boolean =>
  [args.title, args.description, args.dueAt, args.startAt].some((value) => value !== undefined);

/** The `task.updated` for the plain fields, when any was given. */
const fieldEvents = (args: UpdateArgs, when: When, zone: string): readonly EventInput[] =>
  hasFieldChange(args)
    ? [
        stamp(when, {
          payload: {
            ...zonedPayload(args, zone),
            description: args.description,
            taskId: args.taskId,
            title: args.title?.trim(),
          },
          type: "task.updated",
        }),
      ]
    : [];

type ProjectChange = {
  readonly current: null | string;
  readonly next: string | undefined;
};

/** Estimate, preset and project each have their own event; only the given ones are emitted. */
const settingEvents = (
  args: UpdateArgs,
  when: When,
  project: ProjectChange,
): readonly EventInput[] => {
  const { taskId } = args;
  return [
    ...(args.estimateMinutes === undefined
      ? []
      : [
          stamp(when, {
            payload: { estimateMinutes: args.estimateMinutes, taskId },
            type: "task.estimate.set",
          }),
        ]),
    ...(args.presetId === undefined
      ? []
      : [stamp(when, { payload: { presetId: args.presetId, taskId }, type: "task.preset.set" })]),
    ...(project.next === undefined || project.next === project.current
      ? []
      : [stamp(when, { payload: { projectId: project.next, taskId }, type: "task.project.set" })]),
  ];
};

export const updateTask = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
  description:
    "Changes a task's title, description (null clears it), deadline, start, estimate (null clears it), preset or project (by id, or by name — created when new). Only the fields given change; subtasks are kept across a preset switch. Use set_importance, set_status and set_rank for those; mark_subtasks, submit and close_task for progress.",
  handler: async (args, ctx) =>
    await runWrite(ctx, args, {
      build: forTask(args.taskId, (scope, when, task) => {
        const project = resolveProject(scope.state, args, when);
        if (!project.ok) {
          return project;
        }
        const zone = task.dueTz ?? accountTz(scope.state, scope.qctx);
        return ok([
          ...project.value.events,
          ...fieldEvents(args, when, zone),
          ...settingEvents(args, when, { current: task.projectId, next: project.value.projectId }),
        ]);
      }),
      render: (scope, events) => {
        const row = rowOf(scope, args.taskId);
        const label = labelOf(row, args.taskId);
        return {
          structured: { task: row, taskId: args.taskId },
          summary: events.length === 0 ? "Nothing to change." : `Updated ${label}.`,
        };
      },
    }),
  input: {
    ...WRITE_INPUT,
    taskId: TASK_ID,
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    ...ZONED_INPUT,
    estimateMinutes: z.int().min(0).nullable().optional(),
    presetId: z.string().min(1).optional(),
    ...PROJECT_REF,
  },
  name: "update_task",
  output: { ...WRITE_OUTPUT, task: TaskRowSchema.nullable(), taskId: z.string() },
  scope: "tasks:write",
  title: "Update task",
});
