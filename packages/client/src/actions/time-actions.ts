import {
  type ActivityCategory,
  type ActivityReading,
  choiceById,
  defaultsFor,
  err,
  newId,
  ok,
  runningActivities,
  runningActivity,
  t,
  taskById,
  typedActivity,
} from "@pace/core";

import { editActions, type EditActions } from "./activity-edits.ts";
import { type ActionDeps, type ActionResult, emit, stamp, type When } from "./deps.ts";

export type { ActivityEntry, ActivityTarget, PastActivity } from "./activity-edits.ts";

export type ActivityInput = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly taskId?: string | undefined;
  /** Omitted: learned from the label's past runs, else the category's default. */
  readonly expectMinutes?: null | number | undefined;
  /** The button (or its choice) it came from: a second tap on it stops it. */
  readonly buttonId?: string | undefined;
  /** Runs next to the main activity instead of replacing it. */
  readonly alongside?: boolean | undefined;
};

/** How a button's activity starts: in place of the running one, or alongside it. */
export type StartOptions = { readonly alongside?: boolean | undefined };

/** A calendar event the "From calendar" button starts. */
export type CalendarStart = {
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
};

export type TimeActions = EditActions & {
  /**
  A choice of a time-bar button ("sport:60", "chores:ready"): starts it in the account's
  language, or stops it if it is the main activity running (alongside, it always starts).
  */
  readonly startChoice: (choiceId: string, options?: StartOptions) => ActionResult;
  /** "From calendar": the event's title, from its start if it is on already, until its end. */
  readonly startCalendar: (event: CalendarStart, options?: StartOptions) => ActionResult;
  /**
  "What are you doing?": starts at once with the words as typed, a length in them ("20 min")
  as the Expect; a label used before keeps its category, anything else starts as Other.
  */
  readonly startTyped: (text: string, options?: StartOptions) => ActionResult;
  readonly startActivity: (input: ActivityInput, when?: When) => ActionResult;
  /** Time on a task: its title as the label, its estimate as the Expect. */
  readonly focusTask: (taskId: string) => ActionResult;
  /** Stops the main activity, or the one named (an activity run alongside). */
  readonly stopActivity: (when?: StopWhen) => ActionResult;
  /**
  The assistant's reading of a typed activity, written over it unless the person renamed it
  meanwhile (or it is gone): its label, category and, when it found one, its length.
  */
  readonly refineActivity: (
    activityId: string,
    reading: ActivityReading & { readonly typed: string },
  ) => ActionResult;
};

/** When to stop, and which activity: the main one unless named. */
export type StopWhen = When & { readonly activityId?: string | undefined };

/** An activity's Expect is a day at most (what the events accept). */
const MAX_MINUTES = 24 * 60;
/** A label is at most this long (what the events accept). */
const MAX_LABEL = 80;

/** Whole positive minutes up to a day, or nothing. */
const positive = (minutes: null | number | undefined): number | undefined =>
  minutes === null || minutes === undefined || minutes <= 0
    ? undefined
    : Math.min(MAX_MINUTES, Math.round(minutes));

const timeOf = (deps: ActionDeps) => deps.state.store.getState().time;

const startActivity = async (
  deps: ActionDeps,
  input: Parameters<TimeActions["startActivity"]>[0],
  when: When = {},
): ActionResult => {
  const label = input.label.trim().slice(0, MAX_LABEL).trim();
  if (label === "") {
    return err("action/empty-text");
  }
  const learned = defaultsFor(timeOf(deps), { category: input.category, label });
  const expectMinutes = positive(
    input.expectMinutes === undefined ? learned.expectMinutes : input.expectMinutes,
  );
  return await emit(deps, [
    stamp(
      deps,
      {
        payload: {
          activityId: newId(),
          category: input.category,
          label,
          ...(input.taskId !== undefined && { taskId: input.taskId }),
          ...(input.buttonId !== undefined && { buttonId: input.buttonId }),
          ...(expectMinutes !== undefined && { expectMinutes }),
          ...(input.alongside === true && { alongside: true as const }),
        },
        type: "activity.started",
      },
      when,
    ),
  ]);
};

const stopActivity = async (deps: ActionDeps, when: StopWhen = {}): ActionResult => {
  const at = when.at ?? deps.clock.now();
  const running =
    when.activityId === undefined
      ? runningActivity(timeOf(deps), at)
      : (runningActivities(timeOf(deps), at).find((activity) => activity.id === when.activityId) ??
        null);
  return running === null
    ? err("action/nothing-to-do")
    : await emit(deps, [
        stamp(deps, { payload: { activityId: running.id }, type: "activity.stopped" }, when),
      ]);
};

const startChoice = async (
  deps: ActionDeps,
  choiceId: string,
  options: StartOptions = {},
): ActionResult => {
  const found = choiceById(choiceId);
  if (found === null) {
    return err("action/nothing-to-do");
  }
  const isRunning = runningActivity(timeOf(deps), deps.clock.now())?.buttonId === choiceId;
  if (isRunning && options.alongside !== true) {
    return await stopActivity(deps);
  }
  const { language } = deps.state.store.getState().settings;
  return await startActivity(deps, {
    alongside: options.alongside,
    buttonId: choiceId,
    category: found.choice.category,
    expectMinutes: found.choice.expectMinutes,
    label: t(language, found.choice.labelKey ?? found.button.labelKey),
  });
};

/** The calendar's event, begun at its start when that has passed, expected to last until its end. */
const startCalendar = async (
  deps: ActionDeps,
  event: CalendarStart,
  options: StartOptions = {},
): ActionResult => {
  const now = deps.clock.now();
  // A main activity begun since the event started keeps its time: the event takes over from it.
  const since =
    options.alongside === true ? null : (runningActivity(timeOf(deps), now)?.startAt ?? null);
  const begun = Math.min(Date.parse(event.startAt), Date.parse(now));
  const startAt = new Date(
    since === null ? begun : Math.max(begun, Date.parse(since)),
  ).toISOString();
  const minutes = Math.round((Date.parse(event.endAt) - Date.parse(startAt)) / 60_000);
  return await startActivity(
    deps,
    {
      alongside: options.alongside,
      buttonId: "calendar",
      category: "other",
      expectMinutes: minutes > 0 ? minutes : null,
      label: event.title,
    },
    { at: startAt },
  );
};

const startTyped = async (
  deps: ActionDeps,
  text: string,
  options: StartOptions = {},
): ActionResult => {
  const typed = typedActivity(text);
  const key = typed.label.toLowerCase();
  const before = Object.values(timeOf(deps).activities)
    .filter((activity) => activity.label.trim().toLowerCase() === key)
    .toSorted((a, b) => b.startAt.localeCompare(a.startAt))[0];
  // No length typed: the one learned for this label applies.
  return await startActivity(deps, {
    alongside: options.alongside,
    category: before?.category ?? "other",
    label: typed.label,
    ...(typed.expectMinutes !== null && { expectMinutes: typed.expectMinutes }),
  });
};

const refineActivity = async (
  deps: ActionDeps,
  activityId: string,
  { category, expectMinutes, label, typed }: ActivityReading & { readonly typed: string },
): ActionResult => {
  const activity = timeOf(deps).activities[activityId];
  if (activity?.label !== typedActivity(typed).label) {
    return ok([]);
  }
  return await editActions(deps).relabelActivity(activityId, {
    category,
    label,
    ...(expectMinutes !== null && { expectMinutes }),
  });
};

export const timeActions = (deps: ActionDeps): TimeActions => ({
  ...editActions(deps),
  refineActivity: async (activityId, reading) => await refineActivity(deps, activityId, reading),
  focusTask: async (taskId) => {
    const task = taskById(deps.state.store.getState().tasks, taskId);
    if (task === undefined) {
      return err("task/unknown");
    }
    const started = await startActivity(deps, {
      category: "task",
      expectMinutes: task.estimateMinutes,
      label: task.title,
      taskId,
    });
    // Focusing on a paused task picks it up again.
    return started.ok && task.status === "paused"
      ? await emit(deps, [
          stamp(deps, { payload: { status: "in_progress", taskId }, type: "task.status.set" }),
        ])
      : started;
  },
  startActivity: async (input, when) => await startActivity(deps, input, when),
  startCalendar: async (event, options) => await startCalendar(deps, event, options),
  startChoice: async (choiceId, options) => await startChoice(deps, choiceId, options),
  startTyped: async (text, options) => await startTyped(deps, text, options),
  stopActivity: async (when) => await stopActivity(deps, when),
});
