import type { ReactElement } from "react";

import { useIsFocused } from "expo-router";

import { ScreenActive } from "./screen-active-provider.tsx";
import { type SceneProps, SearchParamsScene } from "./search-params.tsx";

/**
A navigator's screen: tells what is inside whether it is the screen in front, and hands it its
search params as one object until they change (`SearchParamsScene`).
*/
export const ScreenScene = ({ children, route }: SceneProps) => (
  <ScreenActive isActive={useIsFocused()}>
    <SearchParamsScene params={route?.params}>{children}</SearchParamsScene>
  </ScreenActive>
);

/** `ScreenScene` as a navigator's `screenLayout`: one function, so the navigator's props stay the same. */
export const sceneLayout = ({ children, route }: SceneProps): ReactElement => (
  <ScreenScene route={route}>{children}</ScreenScene>
);
