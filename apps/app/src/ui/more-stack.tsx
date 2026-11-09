import type { ParamListBase } from "expo-router/react-navigation";

import { Stack, type StackNavigationState } from "expo-router";
import { type ReactNode, useEffect } from "react";

import { ScreenScene } from "./screen-scene.tsx";
import { useTheme } from "./theme-provider.tsx";

/** The More tab's own list: the first screen of its stack. */
export const MORE_ROUTE = "more";

type StackState = Pick<StackNavigationState<ParamListBase>, "index" | "routes">;

/**
The stack with More's list put under its first screen, or null when it already starts there. A
destination opened from elsewhere (Now's bell, a notification, a link, a sidebar on a wide window)
starts the stack at itself; with More under it, Back leads to More, and the More tab shows More
again afterwards instead of the destination left behind.
*/
export const anchoredAtMore = <State extends StackState>(
  state: State,
): null | (Omit<State, "routes"> & { readonly routes: readonly { readonly name: string }[] }) =>
  state.routes[0]?.name === MORE_ROUTE
    ? null
    : { ...state, index: state.index + 1, routes: [{ name: MORE_ROUTE }, ...state.routes] };

type AnchorProps = Readonly<{
  children: ReactNode;
  /** The navigator's own dispatch: a `RESET` to the anchored stack (what `CommonActions.reset` makes). */
  dispatch: (action: { readonly type: "RESET"; readonly payload: object }) => void;
  state: StackNavigationState<ParamListBase>;
}>;

/** Keeps More's list at the bottom of the stack: the screen in front stays as it is. */
const MoreAnchor = ({ children, dispatch, state }: AnchorProps) => {
  useEffect(() => {
    const anchored = anchoredAtMore(state);
    if (anchored !== null) {
      dispatch({ payload: anchored, type: "RESET" });
    }
  }, [dispatch, state]);
  return children;
};

/**
The More tab (spec §4.2.27, F-AND-03): More's list and the destinations it opens (Week, Projects,
Insights, History, Settings, Notifications, Presets, Decisions) in one stack inside the tabs, so a
phone keeps its tab bar under them with More selected, and Back from one leads to More. Beside the
sidebar the same stack is there without a bar; the addresses are the same as before.
*/
export const MoreStack = () => {
  const { palette } = useTheme();
  return (
    <Stack
      layout={({ children, navigation, state }) => (
        <MoreAnchor
          dispatch={(action) => {
            navigation.dispatch(action);
          }}
          state={state}
        >
          {children}
        </MoreAnchor>
      )}
      screenLayout={({ children }) => <ScreenScene>{children}</ScreenScene>}
      screenOptions={{ contentStyle: { backgroundColor: palette["bg.app"] }, headerShown: false }}
    />
  );
};
