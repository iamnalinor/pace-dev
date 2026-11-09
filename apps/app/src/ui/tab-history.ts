/**
A step in the browser's history for a change inside one screen (feedback 5 item 6, QA round 24
R24-02): opening or closing a task beside the list, another day, week or period, a filter.

expo-router writes the address from the navigation state and pushes a browser entry only when a
navigator's history grows; a param change on the screen in front keeps it the same length, so it
replaced the entry and Back left the app. `PUSH_ENTRY`, dispatched just before the param change,
grows the tab navigator's history by one entry for the screen in front: the address then gets a
step of its own, and Back restores the state that entry was recorded with (the screens read their
params, so they show it). The entry left behind keeps what the screen showed (its params and, for
More's stack, the stack's own state), so an in-app Back (`GO_BACK`) restores it as well.
*/

export const PUSH_ENTRY = "PACE_PUSH_ENTRY";

type Route = {
  readonly key: string;
  readonly params?: object | undefined;
  readonly state?: unknown;
};

/** A tab navigator's history entry, as `TabRouter` keeps it, with what the screen showed. */
type Entry = {
  readonly key: string;
  readonly params?: object | undefined;
  /** The screen's own navigator state (More's stack) when the entry was left. */
  readonly shown?: { readonly state: unknown };
  readonly type: string;
};

type TabState = {
  readonly history: readonly Entry[];
  readonly index: number;
  readonly routes: readonly Route[];
};

/** The state with one more entry for the screen in front; the one before keeps what it showed. */
export const withEntryPushed = <State extends TabState>(state: State): State => {
  const front = state.routes[state.index];
  const last = state.history.at(-1);
  if (front === undefined || last === undefined) {
    return state;
  }
  const left: Entry = { ...last, params: front.params, shown: { state: front.state } };
  const entry: Entry = { key: front.key, params: front.params, type: "route" };
  return { ...state, history: [...state.history.slice(0, -1), left, entry] };
};

/**
After `GO_BACK` (`after`) from `before`: the screen gets back what its entry showed, the params
(`fullHistory` does that already) and its own navigator's state.
*/
export const withEntryRestored = <State extends TabState>(
  before: State,
  after: null | State,
): null | State => {
  const back = before.history.at(-2);
  if (after === null || back?.shown === undefined) {
    return after;
  }
  return {
    ...after,
    routes: after.routes.map((route) =>
      route.key === back.key ? { ...route, params: back.params, state: back.shown?.state } : route,
    ),
  };
};

/** A history entry (as `TabRouter` keeps it) of the route `key`. */
const isEntryOf = (value: unknown, key: string): value is Entry =>
  typeof value === "object" && value !== null && "key" in value && value.key === key;

/** The params as an address writes them: a key with no value is not there. */
const written = (params: object | undefined, without?: string): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(params ?? {}).filter(([key, value]) => value !== undefined && key !== without),
  );

/**
Whether the entry before the screen in front is that same screen without `name` and otherwise
as it is: the step its change took (`PUSH_ENTRY`). An action that removes what the param names
(an Inbox note accepted, a task deleted) then takes that step back instead of writing a new one,
so Back does not stop on an entry whose item is gone (review of round 24, I2). A navigator with
no history (More's stack, a phone's tabs) has no such entry.
*/
export const isStepBackWithout = (
  state: {
    readonly history?: readonly unknown[] | undefined;
    readonly index: number;
    readonly routes: readonly Route[];
  },
  name: string,
): boolean => {
  const front = state.routes[state.index];
  const last = state.history?.at(-1);
  const before = state.history?.at(-2);
  if (front === undefined || !isEntryOf(last, front.key) || !isEntryOf(before, front.key)) {
    return false;
  }
  const expected = written(front.params, name);
  const shown = written(before.params);
  const keys = new Set([...Object.keys(expected), ...Object.keys(shown)]);
  return [...keys].every((key) => expected[key] === shown[key]);
};

type Router<State, Action, Options> = {
  readonly getStateForAction: (state: State, action: Action, options: Options) => unknown;
};

/** The tab navigator's router with `PUSH_ENTRY` and the `GO_BACK` that restores an entry. */
export const tabHistoryRouter = <
  State extends TabState,
  Action extends { readonly type: string },
  Options,
>(
  original: Router<State, Action, Options>,
) => ({
  getStateForAction: (state: State, action: Action, options: Options) => {
    if (action.type === PUSH_ENTRY) {
      return withEntryPushed(state);
    }
    const next = original.getStateForAction(state, action, options);
    return action.type === "GO_BACK" ? withEntryRestored(state, next as null | State) : next;
  },
});
