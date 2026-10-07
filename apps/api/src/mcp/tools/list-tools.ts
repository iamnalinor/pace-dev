import { z } from "zod";

import {
  err,
  inboxList,
  nowList,
  ok,
  type Preset,
  projectView,
  resolvePreset,
  reviewItems,
  taskById,
} from "@pace/core";

import { findProject, PROJECT_REF } from "../inputs.ts";
import { defineTool } from "../registry.ts";
import {
  describeRow,
  projectRow,
  ProjectRowSchema,
  rowFromItem,
  TaskRowSchema,
  taskUrl,
  thenBy,
} from "../rows.ts";
import { describeCode, runRead } from "../tool-kit.ts";

const READ_ONLY = { destructiveHint: false, idempotentHint: true, readOnlyHint: true };

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const listNow = defineTool({
  annotations: READ_ONLY,
  description:
    "The Now list: every open task that competes for attention, best urgency score first, with its deadline, lateness and progress; plus the tasks waiting on someone else, how many are folded away as 'later' (future start, empty homework instances) and how many inbox items are unsorted. Use it to answer 'what should I do now', 'what is overdue' or before changing a task you only know by title. Pass projectId to narrow it to one project.",
  handler: async (args, ctx) =>
    await runRead(ctx, (scope) => {
      const options = args.projectId === undefined ? undefined : { projectId: args.projectId };
      const list = nowList(scope.state, scope.qctx, options);
      const items = list.items.map((item) => rowFromItem(scope, item));
      const waiting = list.waiting.map((item) => rowFromItem(scope, item));
      const top = items.slice(0, 5).map((row) => `- ${describeRow(row)}`);
      return ok({
        structured: { inboxCount: list.inboxCount, items, laterCount: list.laterCount, waiting },
        summary: [
          `${plural(items.length, "task")} on Now, ${waiting.length} waiting, ${list.laterCount} later, ${list.inboxCount} in the inbox.`,
          ...top,
        ].join("\n"),
      });
    }),
  input: { projectId: z.string().min(1).optional().describe("Only tasks of this project.") },
  name: "list_now",
  output: {
    inboxCount: z.int(),
    items: z.array(TaskRowSchema),
    laterCount: z.int(),
    waiting: z.array(TaskRowSchema),
  },
  scope: "tasks:read",
  title: "Now list",
});

export const listProjects = defineTool({
  annotations: READ_ONLY,
  description:
    "Every project (active ones first) with its colour, open task count and link. A project is a tag: a task belongs to at most one. Use it to find a project id or to check whether a name already exists before creating tasks in it.",
  handler: async (_args, ctx) =>
    await runRead(ctx, (scope) => {
      const projects = Object.values(scope.state.projects.byId)
        .toSorted((a, b) =>
          thenBy(Number(a.archived) - Number(b.archived), () => a.name.localeCompare(b.name)),
        )
        .map((project) => projectRow(scope, project));
      return ok({
        structured: { projects },
        summary:
          projects.length === 0
            ? "No projects yet."
            : projects
                .map((row) => `- ${row.name} [${row.id}]: ${plural(row.openTasks, "open task")}`)
                .join("\n"),
      });
    }),
  input: {},
  name: "list_projects",
  output: { projects: z.array(ProjectRowSchema) },
  scope: "tasks:read",
  title: "List projects",
});

const AwaitingSchema = z.object({
  dueAt: z.string().nullable(),
  dueTz: z.string().nullable(),
  id: z.string(),
  title: z.string(),
  url: z.string(),
});

const DoneSchema = z.object({
  closedAt: z.string(),
  id: z.string(),
  outcome: z.string(),
  title: z.string(),
  url: z.string(),
});

const StatsSchema = z.object({
  hoursThisWeek: z.number(),
  late: z.int(),
  onTime: z.object({ done: z.int(), total: z.int() }),
  open: z.int(),
  weeklyHours: z.array(z.number()),
});

export const listProjectTasks = defineTool({
  annotations: READ_ONLY,
  description:
    "The project page: its open tasks (best score first, waiting and hidden ones included), the empty homework instances still awaiting an assignment, the closed tasks with their outcomes (done, done_late, cancelled, cancelled_missed, skipped) and the header figures (open, on time x/y, late). Name the project by id or by name.",
  handler: async (args, ctx) =>
    await runRead(ctx, (scope) => {
      const projectId = findProject(scope.state, args);
      if (!projectId.ok) {
        return projectId;
      }
      const view = projectView(scope.state, projectId.value, scope.qctx);
      if (!view.ok) {
        return err({ code: view.error, message: describeCode(view.error) });
      }
      const { project, stats } = view.value;
      const open = view.value.open.map((item) => rowFromItem(scope, item));
      return ok({
        structured: {
          awaiting: view.value.awaiting.map((task) => ({
            dueAt: task.dueAt,
            dueTz: task.dueTz,
            id: task.id,
            title: task.title,
            url: taskUrl(scope.webOrigin, task.id),
          })),
          done: view.value.done.map((entry) => ({
            closedAt: entry.task.closed?.at ?? "",
            id: entry.task.id,
            outcome: entry.outcome,
            title: entry.task.title,
            url: taskUrl(scope.webOrigin, entry.task.id),
          })),
          open,
          project: projectRow(scope, project),
          stats,
        },
        summary: [
          `${project.name}: ${plural(stats.open, "open task")}, on time ${stats.onTime.done}/${stats.onTime.total}, ${stats.late} late, ${view.value.awaiting.length} awaiting assignment.`,
          ...open.slice(0, 5).map((row) => `- ${describeRow(row)}`),
        ].join("\n"),
      });
    }),
  input: PROJECT_REF,
  name: "list_project_tasks",
  output: {
    awaiting: z.array(AwaitingSchema),
    done: z.array(DoneSchema),
    open: z.array(TaskRowSchema),
    project: ProjectRowSchema,
    stats: StatsSchema,
  },
  scope: "tasks:read",
  title: "Project tasks",
});

const presetLine = (preset: Preset): string => {
  const parent = preset.builtIn ? " (built-in)" : ` extends ${preset.extends ?? "?"}`;
  const archived = preset.archived ? " (archived)" : "";
  return `- ${preset.id}: ${preset.name}${parent}${archived}`;
};

const PresetSchema = z.object({
  archived: z.boolean(),
  builtIn: z.boolean(),
  createdAt: z.string(),
  definition: z
    .record(z.string(), z.unknown())
    .describe("What this preset changes relative to its parent."),
  extends: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  resolved: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe("Every setting with inheritance applied; null when the chain is broken."),
});

export const listPresets = defineTool({
  annotations: READ_ONLY,
  description:
    "Every preset: the five built-ins (hw = homework with numbered problems and per-problem submission, work = a link and a progress slider, personal, deferred, inbox) and the user's own (courses extend hw; archived ones stay listed for their existing tasks). Each comes with its own definition and the fully resolved settings: urgency policy, default importance, deadline policy, submission mode, progress mode, weekly recurrence, notify thresholds, default estimate. Use it to pick a presetId for create_task or to check a course's schedule.",
  handler: async (_args, ctx) =>
    await runRead(ctx, (scope) => {
      const presets = Object.values(scope.state.presets.byId)
        .toSorted((a, b) =>
          thenBy(Number(b.builtIn) - Number(a.builtIn), () => a.id.localeCompare(b.id)),
        )
        .map((preset) => {
          const resolved = resolvePreset(scope.state.presets, preset.id);
          return { ...preset, resolved: resolved.ok ? resolved.value : null };
        });
      return ok({
        structured: { presets },
        summary: presets.map((preset) => presetLine(preset)).join("\n"),
      });
    }),
  input: {},
  name: "list_presets",
  output: { presets: z.array(PresetSchema) },
  scope: "tasks:read",
  title: "List presets",
});

const SuggestionSchema = z.object({
  dueAt: z.string().nullable(),
  dueTz: z.string().nullable(),
  importance: z.string(),
  presetId: z.string(),
  projectId: z.string().nullable(),
});

const InboxItemSchema = z.object({
  ageMinutes: z.number(),
  capturedAt: z.string(),
  id: z.string(),
  suggestion: SuggestionSchema.describe(
    "Rule-based triage: what sorting this item would probably set.",
  ),
  text: z.string(),
  unsortedTooLong: z.boolean(),
  url: z.string(),
});

export const listInbox = defineTool({
  annotations: READ_ONLY,
  description:
    "Unsorted captures (texts saved with capture_inbox, the bot or the share sheet), oldest first, each with a rule-based suggestion of preset, project, importance and due date. To sort one, call update_task (preset, project, due) and set_importance on its id, or close_task to drop it.",
  handler: async (_args, ctx) =>
    await runRead(ctx, (scope) => {
      const items = inboxList(scope.state, scope.qctx).map((item) => ({
        ageMinutes: item.ageMinutes,
        capturedAt: item.task.createdAt,
        id: item.task.id,
        suggestion: item.suggestion,
        text: item.task.sourceText ?? item.task.title,
        unsortedTooLong: item.unsortedTooLong,
        url: taskUrl(scope.webOrigin, item.task.id),
      }));
      return ok({
        structured: { items },
        summary:
          items.length === 0
            ? "The inbox is empty."
            : items.map((item) => `- [${item.id}] ${item.text.split("\n", 1)[0] ?? ""}`).join("\n"),
      });
    }),
  input: {},
  name: "list_inbox",
  output: { items: z.array(InboxItemSchema) },
  scope: "tasks:read",
  title: "List inbox",
});

const ReviewItemSchema = z.object({
  actions: z.array(z.string()).describe("Keys accepted by review_action for this item."),
  kind: z
    .string()
    .describe("submitted | deadline-passed | unsorted-too-long | confirm-auto-outcome"),
  since: z.string(),
  taskId: z.string(),
  title: z.string(),
  url: z.string(),
});

export const listReview = defineTool({
  annotations: READ_ONLY,
  description:
    "What the person forgot to tell the system, oldest first: tasks fully solved but still open a day later ('submitted?'), deadlines that passed with no news, inbox items unsorted for days, and automatic outcomes (missed, skipped) awaiting confirmation. Each item lists the action keys review_action accepts: submit-now, mark-done, cancel, skip, keep-open, sort, confirm, undo.",
  handler: async (_args, ctx) =>
    await runRead(ctx, (scope) => {
      const items = reviewItems(scope.state, scope.qctx).map((item) => ({
        actions: item.actions.map((action) => action.key),
        kind: item.kind,
        since: item.since,
        taskId: item.taskId,
        title: taskById(scope.state.tasks, item.taskId)?.title ?? item.taskId,
        url: taskUrl(scope.webOrigin, item.taskId),
      }));
      return ok({
        structured: { items },
        summary:
          items.length === 0
            ? "Nothing to review."
            : items
                .map(
                  (item) =>
                    `- ${item.kind}: ${item.title} [${item.taskId}] → ${item.actions.join(", ")}`,
                )
                .join("\n"),
      });
    }),
  input: {},
  name: "list_review",
  output: { items: z.array(ReviewItemSchema) },
  scope: "tasks:read",
  title: "Review items",
});
