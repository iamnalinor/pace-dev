import {
  CommonActions,
  type TabNavigationState,
  TabRouter,
} from "expo-router/build/react-navigation/routers";

import { isStepBackWithout, isStepScreen, PUSH_ENTRY, tabHistoryRouter } from "./tab-history.ts";

/**
The tab navigator's own router as the web build runs it (expo-router's vendored `TabRouter` with
`fullHistory`), with the override: the step depends on what that router does with `SET_PARAMS`
(it updates the newest history entry of the route) and `GO_BACK` (it restores the entry's params),
so an expo-router upgrade that changes either fails here (review of round 24, minor 3).
*/
const ROUTE_NAMES = ["index", "day", "inbox", "(more)"];
const OPTIONS = { routeGetIdList: {}, routeNames: ROUTE_NAMES, routeParamList: {} };
const tabs = TabRouter({ backBehavior: "fullHistory" });
const router = tabHistoryRouter(tabs);

type State = TabNavigationState<Record<string, object | undefined>>;
/** An action as the navigator gets it; the app's own (`PUSH_ENTRY`) is not in the router's types. */
type Action = {
  readonly payload?: object | undefined;
  readonly source?: string | undefined;
  readonly target?: string | undefined;
  readonly type: string;
};

/** The router's answer to `action`, as react-navigation asks it (the action types are its own). */
const answer = (state: State, action: Action) =>
  router.getStateForAction(
    state,
    action as Parameters<typeof router.getStateForAction>[1],
    OPTIONS,
  );

const run = (state: State, action: Action): State => {
  const next = answer(state, action);
  if (next === null || !("history" in next)) {
    throw new Error(`${action.type} was not handled`);
  }
  return next as State;
};

const initial = (): State => tabs.getInitialState(OPTIONS);
const keyOf = (state: State, name: string): string =>
  state.routes.find((route) => route.name === name)?.key ?? "";
const front = (state: State) => state.routes[state.index];
const navigate = (name: string): Action => CommonActions.navigate({ name });
const setParams = (state: State, params: object): Action => ({
  ...CommonActions.setParams(params),
  source: front(state)?.key ?? "",
});
const push = (state: State, source = front(state)?.key ?? ""): Action => ({
  source,
  type: PUSH_ENTRY,
});

/** On a tab with `params`, after the step a change inside it takes and the change itself. */
const stepTo = (state: State, params: object): State =>
  run(run(state, push(state)), setParams(state, params));

describe("a browser step for a change inside one screen, on the real TabRouter (R24-02)", () => {
  it("grows the history by one entry; the change updates the new entry, the one left keeps what it showed", () => {
    const start = initial();
    const opened = stepTo(start, { task: "t1" });
    expect(opened.history).toHaveLength(2);
    expect(opened.history.at(-1)).toMatchObject({ params: { task: "t1" } });
    expect(opened.history.at(-2)).toMatchObject({ params: undefined });
    expect(front(opened)?.params).toEqual({ task: "t1" });
    const second = stepTo(opened, { task: "t2" });
    expect(second.history).toHaveLength(3);
    expect(second.history.at(-2)).toMatchObject({ params: { task: "t1" } });
  });

  it("restores on Back what each entry showed, back to the screen without the param", () => {
    const second = stepTo(stepTo(initial(), { task: "t1" }), { task: "t2" });
    const back = run(second, { type: "GO_BACK" });
    expect(front(back)?.params).toEqual({ task: "t1" });
    const again = run(back, { type: "GO_BACK" });
    expect(front(again)?.params).toBeUndefined();
    expect(again.history).toHaveLength(1);
  });

  it("makes a tab switch a step of its own, and Back from it returns to the tab as it was (fullHistory)", () => {
    const opened = stepTo(initial(), { task: "t1" });
    const onDay = run(opened, navigate("day"));
    expect(front(onDay)?.name).toBe("day");
    expect(onDay.history).toHaveLength(3);
    const back = run(onDay, { type: "GO_BACK" });
    expect(front(back)?.name).toBe("index");
    expect(front(back)?.params).toEqual({ task: "t1" });
  });

  it("restores the screen's own stack on Back (More's stack: Week with another week)", () => {
    const onMore = run(initial(), navigate("(more)"));
    const moreKey = keyOf(onMore, "(more)");
    const stack = { index: 1, routes: [{ key: "more" }, { key: "week-1", params: { week: "a" } }] };
    const shown: State = {
      ...onMore,
      routes: onMore.routes.map((route) =>
        route.key === moreKey ? { ...route, state: stack } : route,
      ) as State["routes"],
    };
    // Week, inside More's stack, asks for the step: its key is not a tab's, the stack holds it.
    const pushed = run(shown, push(shown, "week-1"));
    expect(pushed.history).toHaveLength(shown.history.length + 1);
    const moved: State = {
      ...pushed,
      routes: pushed.routes.map((route) =>
        route.key === moreKey
          ? {
              ...route,
              state: {
                ...stack,
                routes: [{ key: "more" }, { key: "week-1", params: { week: "b" } }],
              },
            }
          : route,
      ) as State["routes"],
    };
    const back = run(moved, { type: "GO_BACK" });
    expect(back.routes.find((route) => route.key === moreKey)?.state).toBe(stack);
  });

  it("leaves a step asked by a tab left behind unhandled: no phantom entry (minor 6)", () => {
    const start = initial();
    const fromDay = push(start, keyOf(start, "day"));
    expect(answer(start, fromDay)).toBeNull();
  });

  it("knows the entry before as the screen without the param once a change took its step (review I2)", () => {
    const filtered = stepTo(initial(), { project: "p1" });
    const opened = stepTo(filtered, { project: "p1", task: "t1" });
    expect(isStepBackWithout(opened, "task")).toBe(true);
    expect(isStepBackWithout(opened, "project")).toBe(false);
    const other = stepTo(opened, { project: "p1", task: "t2" });
    expect(isStepBackWithout(other, "task")).toBe(false);
  });
});

/** An Inbox entry opened: the entry before shows `before`, the screen shows `front`. */
const opened = (before: object | undefined, front: object | undefined) => ({
  history: [
    { key: "inbox-1", type: "route" },
    { key: "inbox-1", params: before, type: "route" },
    { key: "inbox-1", type: "route" },
  ],
  index: 0,
  routes: [{ key: "inbox-1", params: front }],
});

describe("taking back the step that opened what an action removed (review I2)", () => {
  it("takes it back when the entry before is this screen without the param, the rest the same", () => {
    expect(isStepBackWithout(opened(undefined, { open: "n1" }), "open")).toBe(true);
    expect(isStepBackWithout(opened({ f: "a" }, { f: "a", open: "n1" }), "open")).toBe(true);
    expect(isStepBackWithout(opened({ open: undefined }, { open: "n1" }), "open")).toBe(true);
  });

  it("does not when the entry before shows something else, or is another screen, or there is none", () => {
    expect(isStepBackWithout(opened({ open: "n0" }, { open: "n1" }), "open")).toBe(false);
    expect(isStepBackWithout(opened({ f: "b" }, { f: "a", open: "n1" }), "open")).toBe(false);
    expect(isStepBackWithout(initial(), "task")).toBe(false);
    expect(isStepBackWithout({ index: 0, routes: [{ key: "now-1" }] }, "task")).toBe(false);
  });
});

describe("which screen may take a step (minor 6)", () => {
  type Nav = Parameters<typeof isStepScreen>[0];
  const navigator = (type: string, parent?: Nav, isFocused = true): Nav => ({
    getParent: () => parent,
    getState: () => ({ type }),
    isFocused: () => isFocused,
  });
  const root = navigator("stack");
  const tabs = navigator("tab", root);

  it("lets a tab in front take one, and a screen in a tab's own stack", () => {
    expect(isStepScreen(tabs)).toBe(true);
    expect(isStepScreen(navigator("stack", tabs))).toBe(true);
  });

  it("does not let a screen outside the tabs, or one that is not in front, take one", () => {
    expect(isStepScreen(root)).toBe(false);
    expect(isStepScreen(navigator("tab", root, false))).toBe(false);
  });
});
