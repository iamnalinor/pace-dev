import type { ReactElement } from "react";

import { useIsFocused } from "expo-router";
import { View } from "react-native";

import { ScreenActive } from "./screen-active-provider.tsx";
import { type SceneProps, SearchParamsScene } from "./search-params.tsx";

const HIDDEN = { display: "none" } as const;
const SHOWN = { flex: 1 } as const;

/**
A navigator's screen on the web: a screen that is not in front (a tab left behind, a screen
under a pushed one) is taken out of the page, so its fields and buttons are not reachable by
Tab or a screen reader while hidden, and its shortcuts are silent.
*/
export const ScreenScene = ({ children, route }: SceneProps) => {
  const isFocused = useIsFocused();
  return (
    <ScreenActive isActive={isFocused}>
      <View style={isFocused ? SHOWN : HIDDEN}>
        <SearchParamsScene params={route?.params}>{children}</SearchParamsScene>
      </View>
    </ScreenActive>
  );
};

/** `ScreenScene` as a navigator's `screenLayout`: one function, so the navigator's props stay the same. */
export const sceneLayout = ({ children, route }: SceneProps): ReactElement => (
  <ScreenScene route={route}>{children}</ScreenScene>
);
