import {
  activeSeriesOf,
  type CoreState,
  isUntilBeforeStart,
  type SeriesSchedule,
  type SeriesStartProblem,
  seriesStartProblem,
  taskById,
} from "@pace/core";

/**
Why a repeat choice is refused: a series that cannot start so, or no such task.
`repeat/due-passed` is `repeat/due-before-start` for a task whose start nobody chose (it starts
now): the person is told the deadline has passed, not about a start they never set.
*/
export type RepeatChangeProblem = "repeat/due-passed" | "repeat/task-unknown" | SeriesStartProblem;

/**
Whether a repeat choice would go through, decided before anything is written (bug class 32) by
the same checks the actions make. A running series takes the new schedule from its template's
start; a task without one (never repeated, its series ended, or `taskId: null` for a task still
being made) starts a new series at `start` with `due`, the dates it will have once saved.
*/
export const repeatChangeProblem = (
  state: Pick<CoreState, "series" | "tasks">,
  input: {
    readonly taskId: null | string;
    readonly schedule: null | SeriesSchedule;
    /** The start chosen, or `null`: the series then starts `now`. */
    readonly start: null | { readonly at: string; readonly tz: string };
    readonly now: { readonly at: string; readonly tz: string };
    readonly due: null | { readonly at: string };
  },
): null | RepeatChangeProblem => {
  const task = input.taskId === null ? null : taskById(state.tasks, input.taskId);
  if (task === undefined) {
    return "repeat/task-unknown";
  }
  if (input.schedule === null) {
    return null;
  }
  const series = task === null ? undefined : activeSeriesOf(state.series, task.seriesId);
  if (series === undefined) {
    const problem = seriesStartProblem(input.schedule, {
      due: input.due,
      start: input.start ?? input.now,
    });
    return problem === "repeat/due-before-start" && input.start === null
      ? "repeat/due-passed"
      : problem;
  }
  const start = { at: series.template.startAt, tz: series.template.startTz };
  return isUntilBeforeStart(input.schedule, start) ? "repeat/until-before-start" : null;
};
