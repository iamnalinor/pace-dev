import type { Event, EventOf } from "../events/event-schema.ts";
import type { Reducer } from "../materialize/materializer.ts";
import type { Activity, TimeState } from "./model.ts";

const withActivity = (state: TimeState, activity: Activity): TimeState => ({
  ...state,
  activities: { ...state.activities, [activity.id]: activity },
});

/** A start closes every live activity still running before it (one primary at a time). */
const closeRunning = (
  activities: TimeState["activities"],
  at: string,
): TimeState["activities"] =>
  Object.fromEntries(
    Object.entries(activities).map(([id, activity]) => [
      id,
      !activity.isLogged && activity.endAt === null && activity.startAt <= at
        ? { ...activity, endAt: at }
        : activity,
    ]),
  );

const started = (state: TimeState, event: EventOf<"activity.started">): TimeState => {
  const { payload } = event;
  if (Object.hasOwn(state.activities, payload.activityId)) {
    return state;
  }
  return withActivity(
    { ...state, activities: closeRunning(state.activities, event.occurredAt) },
    {
      buttonId: payload.buttonId ?? null,
      category: payload.category,
      endAt: null,
      expectMinutes: payload.expectMinutes ?? null,
      id: payload.activityId,
      isLogged: false,
      label: payload.label,
      limitMinutes: payload.limitMinutes ?? null,
      startAt: event.occurredAt,
      taskId: payload.taskId ?? null,
    },
  );
};

const logged = (state: TimeState, event: EventOf<"activity.logged">): TimeState => {
  const { payload } = event;
  return Object.hasOwn(state.activities, payload.activityId)
    ? state
    : withActivity(state, {
        buttonId: null,
        category: payload.category,
        endAt: payload.endAt,
        expectMinutes: null,
        id: payload.activityId,
        isLogged: true,
        label: payload.label,
        limitMinutes: null,
        startAt: payload.startAt,
        taskId: payload.taskId ?? null,
      });
};

const patch = (
  state: TimeState,
  activityId: string,
  change: (activity: Activity) => Activity,
): TimeState => {
  const activity = state.activities[activityId];
  return activity === undefined ? state : withActivity(state, change(activity));
};

const buttonSet = (state: TimeState, event: EventOf<"activity.button.set">): TimeState => {
  const { payload } = event;
  return {
    ...state,
    buttons: {
      ...state.buttons,
      [payload.buttonId]: {
        category: payload.category,
        color: payload.color,
        expectMinutes: payload.expectMinutes ?? null,
        id: payload.buttonId,
        label: payload.label,
        limitMinutes: payload.limitMinutes ?? null,
        order: payload.order,
        taskId: payload.taskId ?? null,
      },
    },
    hasCustomButtons: true,
  };
};

const buttonRemoved = (state: TimeState, buttonId: string): TimeState => ({
  ...state,
  buttons: Object.fromEntries(Object.entries(state.buttons).filter(([id]) => id !== buttonId)),
  hasCustomButtons: true,
});

/** Folds the activity events; every other event leaves the state (and its reference) alone. */
export const timeReducer: Reducer<TimeState> = (state, event: Event) => {
  switch (event.type) {
    case "activity.started": {
      return started(state, event);
    }
    case "activity.stopped": {
      return patch(state, event.payload.activityId, (activity) =>
        activity.endAt === null ? { ...activity, endAt: event.occurredAt } : activity,
      );
    }
    case "activity.logged": {
      return logged(state, event);
    }
    case "activity.adjusted": {
      const { endAt, startAt } = event.payload;
      return patch(state, event.payload.activityId, (activity) => ({
        ...activity,
        endAt: endAt ?? activity.endAt,
        startAt: startAt ?? activity.startAt,
      }));
    }
    case "activity.labelled": {
      const { category, label, taskId } = event.payload;
      return patch(state, event.payload.activityId, (activity) => ({
        ...activity,
        category: category ?? activity.category,
        label: label ?? activity.label,
        taskId: taskId === undefined ? activity.taskId : taskId,
      }));
    }
    case "activity.button.set": {
      return buttonSet(state, event);
    }
    case "activity.button.removed": {
      return buttonRemoved(state, event.payload.buttonId);
    }
    default: {
      return state;
    }
  }
};
