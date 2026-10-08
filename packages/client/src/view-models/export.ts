import { type CoreState, type Event, taskTrackedMinutes, timeline } from "@pace/core";

/** One cell of an export: text, a number, or empty. Times are ISO 8601 in UTC. */
export type ExportCell = null | number | string;

/** One sheet: machine-readable column names (field names, not UI text) and its rows. */
export type ExportSheet = {
  readonly name: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly ExportCell[])[];
};

/** The whole history begins before any event could. */
const EPOCH = "2000-01-01T00:00:00.000Z";

const taskSheet = (state: CoreState, now: string): ExportSheet => ({
  columns: [
    "id",
    "title",
    "project",
    "preset",
    "importance",
    "status",
    "dueAt",
    "dueTz",
    "estimateMinutes",
    "trackedMinutes",
    "createdAt",
    "closedAt",
    "outcome",
    "description",
  ],
  name: "tasks",
  rows: Object.values(state.tasks.byId).map((task) => [
    task.id,
    task.title,
    task.projectId === null ? null : (state.projects.byId[task.projectId]?.name ?? null),
    state.presets.byId[task.presetId]?.name ?? task.presetId,
    task.importance,
    task.status,
    task.dueAt,
    task.dueTz,
    task.estimateMinutes,
    taskTrackedMinutes(state, task.id, now),
    task.createdAt,
    task.closed?.at ?? null,
    task.closed?.outcome ?? null,
    task.description,
  ]),
});

const subtaskSheet = (state: CoreState): ExportSheet => ({
  columns: ["taskId", "task", "number", "label", "solvedAt", "submittedAt"],
  name: "subtasks",
  rows: Object.values(state.tasks.byId).flatMap((task) =>
    task.subtasks.map((subtask) => [
      task.id,
      task.title,
      subtask.number,
      subtask.label,
      subtask.solvedAt,
      subtask.submittedAt,
    ]),
  ),
});

const activitySheet = (state: CoreState, now: string): ExportSheet => ({
  columns: ["activityId", "startAt", "endAt", "minutes", "label", "category", "taskId", "logged"],
  name: "activities",
  rows: timeline(state.time, { from: EPOCH, now, to: now }).segments.map((segment) => [
    segment.activityId,
    segment.startAt,
    segment.endAt,
    segment.minutes,
    segment.label,
    segment.category,
    segment.taskId,
    segment.isLogged ? "yes" : "no",
  ]),
});

const projectSheet = (state: CoreState): ExportSheet => ({
  columns: ["id", "name", "createdAt", "archived"],
  name: "projects",
  rows: Object.values(state.projects.byId).map((project) => [
    project.id,
    project.name,
    project.createdAt,
    project.archived ? "yes" : "no",
  ]),
});

const eventSheet = (events: readonly Event[]): ExportSheet => ({
  columns: ["id", "type", "occurredAt", "recordedAt", "source", "deviceId", "payload"],
  name: "events",
  rows: events.map((event) => [
    event.id,
    event.type,
    event.occurredAt,
    event.recordedAt,
    event.source,
    event.deviceId,
    JSON.stringify(event.payload),
  ]),
});

/**
Everything the account holds, as sheets for a spreadsheet: tasks, subtasks, the time ledger,
projects, and the full event log (corrections included) for anything the others leave out.
*/
export const exportSheets = (
  state: CoreState & { readonly log: readonly Event[] },
  now: string,
): readonly ExportSheet[] => [
  taskSheet(state, now),
  subtaskSheet(state),
  activitySheet(state, now),
  projectSheet(state),
  eventSheet(state.log),
];
