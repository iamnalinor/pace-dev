import { err, formatInZone, newId, seriesById, type SeriesSchedule } from "@pace/core";

import { type ActionDeps, type ActionResult, emit, stamp, taskOf } from "./deps.ts";

export type SeriesActions = {
  readonly updateSeries: (seriesId: string, schedule: SeriesSchedule) => ActionResult;
  readonly archiveSeries: (seriesId: string) => ActionResult;
  readonly startSeriesForTask: (taskId: string, schedule: SeriesSchedule) => ActionResult;
};

export const seriesActions = (deps: ActionDeps): SeriesActions => ({
  updateSeries: async (seriesId, schedule) => {
    const series = seriesById(deps.state.store.getState().series, seriesId);
    if (series === undefined || series.archived) {
      return err("action/invalid-input");
    }
    return await emit(deps, [
      stamp(deps, {
        type: "series.updated",
        payload: { seriesId, template: series.template, schedule },
      }),
    ]);
  },
  archiveSeries: async (seriesId) => {
    const series = seriesById(deps.state.store.getState().series, seriesId);
    return series === undefined || series.archived
      ? err("action/invalid-input")
      : await emit(deps, [stamp(deps, { type: "series.archived", payload: { seriesId } })]);
  },
  startSeriesForTask: async (taskId, schedule) => {
    const task = taskOf(deps, taskId);
    if (!task.ok || task.value.seriesId !== null) {
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
    if (
      schedule.until !== undefined &&
      schedule.until < formatInZone(startAt, startTz, "yyyy-MM-dd")
    ) {
      return err("action/invalid-input");
    }
    const template = { ...created.payload, taskId, startAt, startTz, seriesId, seriesRevision: 0 };
    return await emit(deps, [
      stamp(deps, { type: "series.created", payload: { seriesId, schedule, template } }),
      stamp(deps, {
        type: "event.amended",
        payload: { targetId: created.id, patch: { seriesId, seriesRevision: 0, startAt, startTz } },
      }),
    ]);
  },
});
