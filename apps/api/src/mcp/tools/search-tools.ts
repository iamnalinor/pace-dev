import { z } from "zod";

import {
  type CoreState,
  err,
  isOpen,
  ok,
  presetById,
  type Project,
  projectById,
  type Result,
  type Task,
} from "@pace/core";

import { defineTool } from "../registry.ts";
import { projectUrl, rowOf, type TaskRow, taskUrl, thenBy } from "../rows.ts";
import { type Rendered, runRead, type Scope, type ToolFailure } from "../tool-kit.ts";

/** Case folding that treats Cyrillic like Latin and `ё` like `е`. */
const normalize = (text: string): string => text.toLowerCase().replaceAll("ё", "е");

const termsOf = (query: string): readonly string[] =>
  normalize(query)
    .split(/\s+/u)
    .filter((term) => term !== "");

const MAX_RESULTS = 50;

const projectNameOf = (state: CoreState, task: Task): string =>
  task.projectId === null ? "" : (projectById(state.projects, task.projectId)?.name ?? "");

const taskHaystack = (state: CoreState, task: Task): string =>
  normalize(
    [
      task.title,
      task.description ?? "",
      task.sourceText ?? "",
      ...task.subtasks.map((item) => item.label),
      projectNameOf(state, task),
    ].join("\n"),
  );

const projectHaystack = (project: Project): string =>
  normalize(`${project.name}\n${project.description ?? ""}`);

type Hit = { readonly id: string; readonly title: string; readonly url: string };

/** Open tasks before closed ones, most recently touched first. */
const byRelevance = (a: Task, b: Task): number =>
  thenBy(Number(isOpen(b)) - Number(isOpen(a)), () => b.lastEventAt.localeCompare(a.lastEventAt));

const searchTasks = (scope: Scope, terms: readonly string[]): readonly Hit[] =>
  Object.values(scope.state.tasks.byId)
    .filter((task) => {
      const haystack = taskHaystack(scope.state, task);
      return terms.every((term) => haystack.includes(term));
    })
    .toSorted(byRelevance)
    .map((task) => ({ id: task.id, title: task.title, url: taskUrl(scope.webOrigin, task.id) }));

const searchProjects = (scope: Scope, terms: readonly string[]): readonly Hit[] =>
  Object.values(scope.state.projects.byId)
    .filter((project) => {
      const haystack = projectHaystack(project);
      return terms.every((term) => haystack.includes(term));
    })
    .toSorted((a, b) =>
      thenBy(Number(a.archived) - Number(b.archived), () => a.name.localeCompare(b.name)),
    )
    .map((project) => ({
      id: project.id,
      title: project.name,
      url: projectUrl(scope.webOrigin, project.id),
    }));

const HitSchema = z.object({ id: z.string(), title: z.string(), url: z.string() });

export const search = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
  description:
    "Full-text search over task titles, descriptions, source texts, subtask labels and project names (case-insensitive, any language). Every word of the query must match. Returns up to 50 hits as { id, title, url } (tasks first, open before closed, then projects); pass an id to fetch or get_task for the details. Use it when you know a task by words, not by id.",
  handler: async (args, ctx) =>
    await runRead(ctx, (scope) => {
      const terms = termsOf(args.query);
      const results =
        terms.length === 0
          ? []
          : [...searchTasks(scope, terms), ...searchProjects(scope, terms)].slice(0, MAX_RESULTS);
      return ok({
        structured: { results },
        summary:
          results.length === 0
            ? `No tasks or projects match "${args.query}".`
            : results.map((hit) => `- ${hit.title} [${hit.id}]`).join("\n"),
      });
    }),
  input: { query: z.string().min(1).describe("Words to look for; all must appear.") },
  name: "search",
  output: { results: z.array(HitSchema) },
  scope: "tasks:read",
  title: "Search",
});

/** A labelled line, or nothing when there is no value to show. */
const line = (label: string, value: null | number | string | undefined): readonly string[] =>
  (value ?? "") === "" ? [] : [`${label}: ${String(value)}`];

const box = (isDone: boolean): string => (isDone ? "[x]" : "[ ]");

const subtaskLine = (item: Task["subtasks"][number]): string => {
  const marks = [
    ...(item.solvedAt === null ? [] : [`solved ${item.solvedAt}`]),
    ...(item.submittedAt === null ? [] : [`submitted ${item.submittedAt}`]),
  ];
  const suffix = marks.length === 0 ? "" : ` (${marks.join(", ")})`;
  return `- ${box(item.solvedAt !== null)} ${item.label}${suffix}`;
};

/** A section with a heading, or nothing when it is empty. */
const section = (heading: string, lines: readonly string[]): readonly string[] =>
  lines.length === 0 ? [] : ["", `## ${heading}`, ...lines];

const dueLine = (task: Task): readonly string[] =>
  task.dueAt === null ? [] : line("Due", `${task.dueAt} (${task.dueTz ?? "UTC"})`);

const outcomeLine = (task: Task, outcome: null | string): readonly string[] =>
  task.closed === null
    ? []
    : line("Outcome", `${outcome ?? task.closed.outcome} at ${task.closed.at}`);

const taskHeader = (scope: Scope, task: Task, row: null | TaskRow): readonly string[] => [
  `# ${task.title}`,
  ...line("Preset", presetById(scope.state.presets, task.presetId)?.name ?? task.presetId),
  ...line("Project", projectNameOf(scope.state, task)),
  ...line("Importance", row?.importance),
  ...line("Status", task.status),
  ...dueLine(task),
  ...line("Start", task.startAt),
  ...line("Estimate (minutes)", task.estimateMinutes),
  ...outcomeLine(task, row?.outcome ?? null),
];

const taskMetadata = (task: Task, row: null | TaskRow) => ({
  closedAt: task.closed?.at ?? null,
  dueAt: task.dueAt,
  importance: row?.importance ?? null,
  kind: "task",
  outcome: row?.outcome ?? null,
  presetId: task.presetId,
  projectId: task.projectId,
  status: task.status,
});

const taskDocument = (scope: Scope, task: Task): Rendered => {
  const row = rowOf(scope, task.id);
  const text = [
    ...taskHeader(scope, task, row),
    ...section("Description", task.description === null ? [] : [task.description]),
    ...section(
      "Subtasks",
      task.subtasks.map((item) => subtaskLine(item)),
    ),
    ...section("Source text", task.sourceText === null ? [] : [task.sourceText]),
  ].join("\n");
  const metadata = taskMetadata(task, row);
  return {
    structured: {
      id: task.id,
      metadata,
      text,
      title: task.title,
      url: taskUrl(scope.webOrigin, task.id),
    },
    summary: text,
  };
};

const projectTaskLine = (task: Task): string => {
  const outcome = task.closed === null ? "" : ` — ${task.closed.outcome}`;
  return `- ${box(!isOpen(task))} ${task.title} (${task.id})${outcome}`;
};

const projectDocument = (scope: Scope, project: Project): Rendered => {
  const tasks = Object.values(scope.state.tasks.byId)
    .filter((task) => task.projectId === project.id)
    .toSorted(byRelevance);
  const text = [
    `# ${project.name}`,
    ...line("Status", project.archived ? "archived" : "active"),
    ...(project.description === null ? [] : ["", project.description]),
    "",
    "## Tasks",
    ...tasks.map((task) => projectTaskLine(task)),
  ].join("\n");
  const metadata = {
    archived: project.archived,
    kind: "project",
    openTasks: tasks.filter(isOpen).length,
    tasks: tasks.length,
  };
  return {
    structured: {
      id: project.id,
      metadata,
      text,
      title: project.name,
      url: projectUrl(scope.webOrigin, project.id),
    },
    summary: text,
  };
};

const documentOf = (scope: Scope, id: string): Result<Rendered, ToolFailure> => {
  const task = Object.hasOwn(scope.state.tasks.byId, id) ? scope.state.tasks.byId[id] : undefined;
  if (task !== undefined) {
    return ok(taskDocument(scope, task));
  }
  const project = projectById(scope.state.projects, id);
  return project === undefined
    ? err({ code: "fetch/not-found", message: `No task or project with id ${id}` })
    : ok(projectDocument(scope, project));
};

export const fetchDocument = defineTool({
  annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: true },
  description:
    "The full document behind a search hit: a task (title, preset, project, deadline, status, outcome, description, subtasks with their marks, source text) or a project (description and its tasks), as { id, title, text, url, metadata }. Use it after search when you need the content; get_task gives the same task with scores and structured subtasks.",
  handler: async (args, ctx) => await runRead(ctx, (scope) => documentOf(scope, args.id)),
  input: { id: z.string().min(1).describe("A task or project id from search.") },
  name: "fetch",
  output: {
    id: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    text: z.string(),
    title: z.string(),
    url: z.string(),
  },
  scope: "tasks:read",
  title: "Fetch document",
});
