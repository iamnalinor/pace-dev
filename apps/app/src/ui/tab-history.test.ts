import { PUSH_ENTRY, tabHistoryRouter, type withEntryPushed } from "./tab-history.ts";

type State = Parameters<typeof withEntryPushed>[0];

const MORE_STACK = { index: 1, routes: [{ key: "more" }, { key: "week", params: { week: "a" } }] };

/** Now in front with a task open, More's stack behind it with a week picked. */
const state: State = {
  history: [
    { key: "more-1", type: "route" },
    { key: "now-1", type: "route" },
  ],
  index: 0,
  routes: [
    { key: "now-1", params: { task: "t1" } },
    { key: "more-1", state: MORE_STACK },
  ],
};

/** What `TabRouter` does with `fullHistory`: `GO_BACK` drops the last entry and restores its params. */
const original = {
  getStateForAction: (current: State, action: { readonly type: string }) => {
    if (action.type !== "GO_BACK") {
      return action.type === "SET_PARAMS" ? current : null;
    }
    const back = current.history.at(-2);
    return {
      ...current,
      history: current.history.slice(0, -1),
      index: current.routes.findIndex((route) => route.key === back?.key),
      routes: current.routes.map((route) =>
        route.key === back?.key ? { ...route, params: back.params } : route,
      ),
    };
  },
};

const router = tabHistoryRouter(original);

describe("a browser step for a change inside one screen (R24-02)", () => {
  it("grows the history by one entry for the screen in front, the one left keeping what it showed", () => {
    const pushed = router.getStateForAction(state, { type: PUSH_ENTRY }, {}) as State;
    expect(pushed.history).toHaveLength(3);
    expect(pushed.history.at(-1)).toEqual({ key: "now-1", params: { task: "t1" }, type: "route" });
    expect(pushed.history.at(-2)).toEqual({
      key: "now-1",
      params: { task: "t1" },
      shown: { state: undefined },
      type: "route",
    });
    expect(pushed.routes).toBe(state.routes);
  });

  it("restores on Back what the entry showed: the params and the screen's own stack", () => {
    const onMore: State = { ...state, history: [{ key: "more-1", type: "route" }], index: 1 };
    const pushed = router.getStateForAction(onMore, { type: PUSH_ENTRY }, {}) as State;
    // The week changes after the step: its stack shows another week.
    const moved: State = {
      ...pushed,
      routes: pushed.routes.map((route) =>
        route.key === "more-1"
          ? {
              ...route,
              state: {
                ...MORE_STACK,
                routes: [{ key: "more" }, { key: "week", params: { week: "b" } }],
              },
            }
          : route,
      ),
    };
    const back = router.getStateForAction(moved, { type: "GO_BACK" }, {}) as State;
    expect(back.history).toHaveLength(1);
    expect(back.routes[1]?.state).toBe(MORE_STACK);
  });

  it("leaves every other action to the tab router", () => {
    expect(router.getStateForAction(state, { type: "SET_PARAMS" }, {})).toBe(state);
    expect(router.getStateForAction(state, { type: "NAVIGATE" }, {})).toBeNull();
    // Back over an entry the tabs made themselves (no step recorded): as the tab router has it.
    const back = router.getStateForAction(state, { type: "GO_BACK" }, {}) as State;
    expect(back.index).toBe(1);
    expect(back.routes[1]?.state).toBe(MORE_STACK);
  });
});
