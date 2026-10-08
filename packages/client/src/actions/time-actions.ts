import {
  type ActivityButton,
  type ActivityCategory,
  CATEGORY_COLORS,
  defaultsFor,
  effectiveButtons,
  err,
  newId,
  type ProjectColorName,
  runningActivity,
  taskById,
} from "@pace/core";

import { type ActionDeps, type ActionResult, type Body, emit, stamp, type When } from "./deps.ts";

/** What the button editor sends: the label and the defaults an activity started from it gets. */
export type ButtonDraft = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color?: ProjectColorName | undefined;
  readonly taskId?: null | string | undefined;
  readonly expectMinutes: null | number;
  readonly limitMinutes: null | number;
};

export type ActivityInput = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly taskId?: string | undefined;
  /** Omitted: learned from the label's past runs, else the category's default. */
  readonly expectMinutes?: null | number | undefined;
  readonly limitMinutes?: null | number | undefined;
};

export type PastActivity = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly startAt: string;
  readonly endAt: string;
  readonly taskId?: string | undefined;
};

export type TimeActions = {
  /** One tap on the time bar: starts the button's activity (ending the running one), or stops it if it is the one running. */
  readonly tapButton: (buttonId: string) => ActionResult;
  readonly startActivity: (input: ActivityInput, when?: When) => ActionResult;
  /** Time on a task: its title as the label, its estimate as the Expect. */
  readonly focusTask: (taskId: string) => ActionResult;
  readonly stopActivity: (when?: When) => ActionResult;
  readonly logPast: (activity: PastActivity) => ActionResult;
  readonly adjustActivity: (
    activityId: string,
    change: { readonly startAt?: string; readonly endAt?: string },
  ) => ActionResult;
  readonly relabelActivity: (
    activityId: string,
    change: {
      readonly label?: string;
      readonly category?: ActivityCategory;
      readonly taskId?: null | string;
    },
  ) => ActionResult;
  /** Saves a button (`null` adds one). The first edit writes the default buttons as the account's own. */
  readonly saveButton: (buttonId: null | string, draft: ButtonDraft) => ActionResult;
  readonly removeButton: (buttonId: string) => ActionResult;
};

const positive = (minutes: null | number | undefined): number | undefined =>
  minutes === null || minutes === undefined || minutes <= 0 ? undefined : Math.round(minutes);

const buttonBody = (button: ActivityButton): Body => ({
  payload: {
    buttonId: button.id,
    category: button.category,
    color: button.color,
    expectMinutes: button.expectMinutes,
    label: button.label,
    limitMinutes: button.limitMinutes,
    order: button.order,
    ...(button.taskId !== null && { taskId: button.taskId }),
  },
  type: "activity.button.set",
});

export const timeActions = (deps: ActionDeps): TimeActions => {
  const time = () => deps.state.store.getState().time;
  const now = () => deps.clock.now();

  const startActivity: TimeActions["startActivity"] = async (input, when = {}) => {
    const label = input.label.trim();
    if (label === "") {
      return err("action/empty-text");
    }
    const learned = defaultsFor(time(), { category: input.category, label });
    const expectMinutes = input.expectMinutes === undefined ? learned.expectMinutes : input.expectMinutes;
    const limitMinutes = input.limitMinutes === undefined ? learned.limitMinutes : input.limitMinutes;
    return await emit(deps, [
      stamp(
        deps,
        {
          payload: {
            activityId: newId(),
            category: input.category,
            label,
            ...(input.taskId !== undefined && { taskId: input.taskId }),
            ...(positive(expectMinutes) !== undefined && { expectMinutes: positive(expectMinutes) }),
            ...(positive(limitMinutes) !== undefined && { limitMinutes: positive(limitMinutes) }),
          },
          type: "activity.started",
        },
        when,
      ),
    ]);
  };

  const stopActivity: TimeActions["stopActivity"] = async (when = {}) => {
    const running = runningActivity(time(), when.at ?? now());
    return running === null
      ? err("action/nothing-to-do")
      : await emit(deps, [
          stamp(deps, { payload: { activityId: running.id }, type: "activity.stopped" }, when),
        ]);
  };

  /** The bar as it stands; the first edit turns the defaults into the account's own buttons. */
  const writeButtons = async (buttons: readonly ActivityButton[], removed: readonly string[]): ActionResult =>
    await emit(deps, [
      ...buttons.map((button) => stamp(deps, buttonBody(button))),
      ...removed.map((buttonId) =>
        stamp(deps, { payload: { buttonId }, type: "activity.button.removed" }),
      ),
    ]);

  return {
    adjustActivity: async (activityId, change) => {
      const activity = time().activities[activityId];
      if (activity === undefined) {
        return err("event/not-found");
      }
      const startAt = change.startAt ?? activity.startAt;
      const endAt = change.endAt ?? activity.endAt;
      if (endAt !== null && Date.parse(endAt) <= Date.parse(startAt)) {
        return err("action/invalid-input");
      }
      return await emit(deps, [
        stamp(deps, { payload: { activityId, ...change }, type: "activity.adjusted" }),
      ]);
    },
    focusTask: async (taskId) => {
      const task = taskById(deps.state.store.getState().tasks, taskId);
      return task === undefined
        ? err("task/unknown")
        : await startActivity({
            category: "task",
            expectMinutes: task.estimateMinutes,
            label: task.title.slice(0, 80),
            limitMinutes: null,
            taskId,
          });
    },
    logPast: async (activity) => {
      const label = activity.label.trim();
      if (label === "" || Date.parse(activity.endAt) <= Date.parse(activity.startAt)) {
        return err("action/invalid-input");
      }
      return await emit(deps, [
        stamp(
          deps,
          {
            payload: {
              activityId: newId(),
              category: activity.category,
              endAt: activity.endAt,
              label,
              startAt: activity.startAt,
              ...(activity.taskId !== undefined && { taskId: activity.taskId }),
            },
            type: "activity.logged",
          },
          { at: activity.endAt },
        ),
      ]);
    },
    relabelActivity: async (activityId, change) =>
      time().activities[activityId] === undefined
        ? err("event/not-found")
        : await emit(deps, [
            stamp(deps, { payload: { activityId, ...change }, type: "activity.labelled" }),
          ]),
    removeButton: async (buttonId) => {
      const current = effectiveButtons(time());
      if (!current.some((button) => button.id === buttonId)) {
        return err("action/nothing-to-do");
      }
      return time().hasCustomButtons
        ? await writeButtons([], [buttonId])
        : await writeButtons(current.filter((button) => button.id !== buttonId), []);
    },
    saveButton: async (buttonId, draft) => {
      const label = draft.label.trim();
      if (label === "") {
        return err("action/empty-text");
      }
      const current = effectiveButtons(time());
      const existing = current.find((button) => button.id === buttonId);
      const saved: ActivityButton = {
        category: draft.category,
        color: draft.color ?? CATEGORY_COLORS[draft.category],
        expectMinutes: positive(draft.expectMinutes) ?? null,
        id: existing?.id ?? `btn:${newId()}`,
        label,
        limitMinutes: positive(draft.limitMinutes) ?? null,
        order: existing?.order ?? Math.max(-1, ...current.map((button) => button.order)) + 1,
        taskId: draft.taskId ?? null,
      };
      const others = time().hasCustomButtons ? [] : current.filter((button) => button.id !== saved.id);
      return await writeButtons([...others, saved], []);
    },
    startActivity,
    stopActivity,
    tapButton: async (buttonId) => {
      const button = effectiveButtons(time()).find((candidate) => candidate.id === buttonId);
      if (button === undefined) {
        return err("action/nothing-to-do");
      }
      const running = runningActivity(time(), now());
      if (running?.buttonId === buttonId) {
        return await stopActivity();
      }
      return await emit(deps, [
        stamp(deps, {
          payload: {
            activityId: newId(),
            buttonId,
            category: button.category,
            label: button.label,
            ...(button.taskId !== null && { taskId: button.taskId }),
            ...(button.expectMinutes !== null && { expectMinutes: button.expectMinutes }),
            ...(button.limitMinutes !== null && { limitMinutes: button.limitMinutes }),
          },
          type: "activity.started",
        }),
      ]);
    },
  };
};
