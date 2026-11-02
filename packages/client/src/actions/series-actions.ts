import {
  activeSeriesOf,
  err,
  type EventOf,
  isUntilBeforeStart,
  newId,
  seriesAnchor,
  type SeriesSchedule,
  seriesStartProblem,
  type Task,
} from "@pace/core";

import { type ActionDeps, type ActionResult, emit, stamp, taskOf } from "./deps.ts";

export type SeriesActions = {
  readonly updateSeries: (seriesId: string, schedule: SeriesSchedule) => ActionResult;
  /** `keepTaskId`: the instance it was ended from, which stays as an ordinary task. */
  readonly archiveSeries: (seriesId: string, keepTaskId?: string) => ActionResult;
  readonly startSeriesForTask: (taskId: string, schedule: SeriesSchedule) => ActionResult;
};

/** A new series starts from the task as it is now, with fresh progress for each instance. */
const templateDetails = (task: Task, startTz: string) => ({
  ...(task.projectId !== null && { projectId: task.projectId }),
  ...(task.importance !== null && { importance: task.importance }),
  ...(task.dueAt !== null && { dueAt: task.dueAt, dueTz: task.dueTz ?? startTz }),
  ...(task.estimateMinutes !== null && { estimateMinutes: task.estimateMinutes }),
  ...(task.description !== null && { description: task.description }),
  ...(task.sourceText !== null && { sourceText: task.sourceText }),
  ...(task.overrides !== null && { overrides: task.overrides }),
});

const templateFields = (task: Task) => ({
  ...(task.fields.link !== null && { link: task.fields.link }),
  ...(task.fields.submitVia !== null && { submitVia: task.fields.submitVia }),
});

const templateOf = (
  task: Task,
  input: { readonly seriesId: string; readonly startAt: string; readonly startTz: string },
): EventOf<"series.created">["payload"]["template"] => ({
  taskId: task.id,
  title: task.title,
  presetId: task.presetId,
  ...templateDetails(task, input.startTz),
  // Counted from the task's own start, else from 00:00 today (QA round 14 L10e).
  startAt: seriesAnchor(task.startAt, { at: input.startAt, tz: input.startTz }),
  startTz: input.startTz,
  subtasks: task.subtasks.map((subtask) => ({
    id: subtask.id,
    label: subtask.label,
    ...(subtask.number !== null && { number: subtask.number }),
  })),
  fields: templateFields(task),
  seriesId: input.seriesId,
  seriesRevision: 0,
});

export const seriesActions = (deps: ActionDeps): SeriesActions => ({
  updateSeries: async (seriesId, schedule) => {
    const series = activeSeriesOf(deps.state.store.getState().series, seriesId);
    if (
      series === undefined ||
      isUntilBeforeStart(schedule, { at: series.template.startAt, tz: series.template.startTz })
    ) {
      return err("action/invalid-input");
    }
    return await emit(deps, [
      stamp(deps, {
        type: "series.updated",
        payload: { seriesId, template: series.template, schedule },
      }),
    ]);
  },
  archiveSeries: async (seriesId, keepTaskId) => {
    const series = activeSeriesOf(deps.state.store.getState().series, seriesId);
    return series === undefined
      ? err("action/invalid-input")
      : await emit(deps, [
          stamp(deps, {
            type: "series.archived",
            payload: { seriesId, ...(keepTaskId !== undefined && { keepTaskId }) },
          }),
        ]);
  },
  startSeriesForTask: async (taskId, schedule) => {
    const task = taskOf(deps, taskId);
    // A task whose series ended starts a new one; a task in a running series cannot.
    if (
      !task.ok ||
      activeSeriesOf(deps.state.store.getState().series, task.value.seriesId) !== undefined
    ) {
      return err("action/invalid-input");
    }
    const created = deps.state.store
      .getState()
      .events.find((event) => event.type === "task.created" && event.payload.taskId === taskId);
    if (created?.type !== "task.created") {
      return err("action/invalid-input");
    }
    const seriesId = newId();
    const startAt = task.value.startAt ?? deps.clock.now();
    const startTz = task.value.startTz ?? deps.clock.deviceTz;
    const due = task.value.dueAt === null ? null : { at: task.value.dueAt };
    if (seriesStartProblem(schedule, { due, start: { at: startAt, tz: startTz } }) !== null) {
      return err("action/invalid-input");
    }
    const template = templateOf(task.value, { seriesId, startAt, startTz });
    return await emit(deps, [
      stamp(deps, { type: "series.created", payload: { seriesId, schedule, template } }),
      stamp(deps, {
        type: "event.amended",
        payload: { targetId: created.id, patch: { seriesId, seriesRevision: 0, startAt, startTz } },
      }),
    ]);
  },
});
