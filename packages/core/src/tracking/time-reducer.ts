import type { Event, EventOf, EventType } from "../events/event-schema.ts";
import type { Reducer } from "../materialize/materializer.ts";
import type { Activity, TimeState } from "./model.ts";

const withActivity = (state: TimeState, activity: Activity): TimeState => ({
  ...state,
  activities: { ...state.activities, [activity.id]: activity },
});

/** A main start closes the main activity still running before it (one main at a time). */
const closeRunning = (activities: TimeState["activities"], at: string): TimeState["activities"] =>
  Object.fromEntries(
    Object.entries(activities).map(([id, activity]) => [
      id,
      !activity.isLogged &&
      !activity.isAlongside &&
      activity.endAt === null &&
      activity.startAt <= at
        ? { ...activity, endAt: at }
        : activity,
    ]),
  );

const started = (state: TimeState, event: EventOf<"activity.started">): TimeState => {
  const { payload } = event;
  if (Object.hasOwn(state.activities, payload.activityId)) {
    return state;
  }
  const isAlongside = payload.alongside === true;
  return withActivity(
    {
      ...state,
      activities: isAlongside ? state.activities : closeRunning(state.activities, event.occurredAt),
    },
    {
      buttonId: payload.buttonId ?? null,
      category: payload.category,
      endAt: null,
      expectMinutes: payload.expectMinutes ?? null,
      id: payload.activityId,
      isAlongside,
      isLogged: false,
      label: payload.label,
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
        isAlongside: false,
        isLogged: true,
        label: payload.label,
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

type ActivityEventType = Extract<EventType, `activity.${string}`>;

/** Indexing a mapped type by its own key keeps `type` and `payload` correlated. */
type ActivityEvent<K extends ActivityEventType = ActivityEventType> = {
  readonly [P in K]: EventOf<P>;
}[K];

type Handlers = {
  readonly [T in ActivityEventType]: (state: TimeState, event: EventOf<T>) => TimeState;
};

const HANDLERS: Handlers = {
  "activity.started": started,
  "activity.stopped": (state, event) =>
    patch(state, event.payload.activityId, (activity) =>
      activity.endAt === null ? { ...activity, endAt: event.occurredAt } : activity,
    ),
  "activity.logged": logged,
  "activity.adjusted": (state, event) => {
    const { endAt, startAt } = event.payload;
    return patch(state, event.payload.activityId, (activity) => ({
      ...activity,
      endAt: endAt ?? activity.endAt,
      startAt: startAt ?? activity.startAt,
    }));
  },
  "activity.labelled": (state, event) => {
    const { category, expectMinutes, label, taskId } = event.payload;
    return patch(state, event.payload.activityId, (activity) => ({
      ...activity,
      category: category ?? activity.category,
      expectMinutes: expectMinutes === undefined ? activity.expectMinutes : expectMinutes,
      label: label ?? activity.label,
      taskId: taskId === undefined ? activity.taskId : taskId,
    }));
  },
  // The bar's buttons are fixed now: the old edits stay in the log and change nothing.
  "activity.button.set": (state) => state,
  "activity.button.removed": (state) => state,
};

const isActivityEvent = (event: Event): event is ActivityEvent =>
  Object.hasOwn(HANDLERS, event.type);

const applyActivityEvent = <K extends ActivityEventType>(
  state: TimeState,
  event: ActivityEvent<K>,
): TimeState => HANDLERS[event.type](state, event);

/** Folds the activity events; every other event leaves the state (and its reference) alone. */
export const timeReducer: Reducer<TimeState> = (state, event: Event) =>
  isActivityEvent(event) ? applyActivityEvent(state, event) : state;
