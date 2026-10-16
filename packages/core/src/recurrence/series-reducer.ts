import type { Event, EventOf } from "../events/event-schema.ts";
import type { Reducer } from "../materialize/materializer.ts";

export type Series = {
  readonly id: string;
  readonly template: EventOf<"series.created">["payload"]["template"];
  readonly schedule: EventOf<"series.created">["payload"]["schedule"];
  readonly revision: number;
  readonly archived: boolean;
  readonly createdAt: string;
};

export type SeriesState = { readonly byId: Readonly<Record<string, Series>> };
export const INITIAL_SERIES_STATE: SeriesState = { byId: {} };

export const seriesById = (state: SeriesState, id: string): Series | undefined =>
  Object.hasOwn(state.byId, id) ? state.byId[id] : undefined;

const created = (state: SeriesState, event: EventOf<"series.created">): SeriesState => {
  const { seriesId, schedule, template } = event.payload;
  return seriesById(state, seriesId) === undefined
    ? {
        byId: {
          ...state.byId,
          [seriesId]: {
            id: seriesId,
            schedule,
            template,
            revision: 0,
            archived: false,
            createdAt: event.occurredAt,
          },
        },
      }
    : state;
};

const updated = (state: SeriesState, event: EventOf<"series.updated">): SeriesState => {
  const prior = seriesById(state, event.payload.seriesId);
  if (prior === undefined || prior.archived) {
    return state;
  }
  const revision = prior.revision + 1;
  return {
    byId: {
      ...state.byId,
      [prior.id]: {
        ...prior,
        schedule: event.payload.schedule,
        template: { ...event.payload.template, seriesRevision: revision },
        revision,
      },
    },
  };
};

const archived = (state: SeriesState, event: EventOf<"series.archived">): SeriesState => {
  const prior = seriesById(state, event.payload.seriesId);
  return prior === undefined || prior.archived
    ? state
    : { byId: { ...state.byId, [prior.id]: { ...prior, archived: true } } };
};

export const seriesReducer: Reducer<SeriesState> = (state, event: Event): SeriesState => {
  if (event.type === "series.created") {
    return created(state, event);
  }
  if (event.type === "series.updated") {
    return updated(state, event);
  }
  return event.type === "series.archived" ? archived(state, event) : state;
};
