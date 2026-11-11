import { useIsFocused } from "expo-router";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { type SceneMotion, sceneMotion } from "./scene-motion.ts";
import { ScreenActive } from "./screen-active-provider.tsx";
import { type SceneProps, SearchParamsScene } from "./search-params.tsx";

const HIDDEN = { display: "none" } as const;
const SHOWN = { flex: 1 } as const;

/** Whether the app's first screens have been shown: the ones mounted before are not "pushed". */
const start = { isOver: false };

/** react-native-web writes `data-pace-route`: `global.css` holds the two animations. */
const MARKS: Readonly<Record<SceneMotion, object | undefined>> = {
  back: { dataSet: { paceRoute: "back" } },
  in: { dataSet: { paceRoute: "in" } },
  none: undefined,
};

/**
The route-transition mark of a screen (spec §6 "route push / pop"): "in" for a stack's screen pushed
after the app opened, "back" once it has left the front (it plays when it is shown again), and gone
once its animation has ended, so a tab left and opened again never replays it.
*/
const useSceneMark = (isFocused: boolean, isPushed: boolean) => {
  const [wasThereAtStart] = useState(!start.isOver);
  const [mark, setMark] = useState(() =>
    sceneMotion({ hasLeft: false, isPushed, wasThereAtStart }),
  );
  // Adjusted while rendering: the mark is already "back" in the frame the screen is hidden.
  const left = sceneMotion({ hasLeft: true, isPushed, wasThereAtStart });
  if (!isFocused && mark !== left) {
    setMark(left);
  }
  useEffect(() => {
    start.isOver = true;
  }, []);
  const boxRef = useRef<View>(null);
  useEffect(() => {
    // Played once: the browser replays an element's animation whenever it (or a parent: a tab
    // left and opened again) is put back in the page, so the mark goes when the animation ends.
    const box = boxRef.current as unknown as HTMLElement | null;
    const onEnd = (event: AnimationEvent): void => {
      if (event.target === box) {
        setMark("none");
      }
    };
    box?.addEventListener("animationend", onEnd);
    return () => {
      box?.removeEventListener("animationend", onEnd);
    };
  }, []);
  return { boxRef, mark };
};

/**
A navigator's screen on the web: a screen that is not in front (a tab left behind, a screen
under a pushed one) is taken out of the page, so its fields and buttons are not reachable by
Tab or a screen reader while hidden, and its shortcuts are silent. A stack's screen (`pushed`)
comes to the front with the route transition of spec §6 (a CSS animation); a tab's screen simply
shows. Its search params are handed down as one object until they change (`SearchParamsScene`).
*/
export const ScreenScene = ({
  children,
  pushed = false,
  route,
}: SceneProps & {
  /** A stack's screen: it slides in when pushed and comes back when the one above is popped. */
  readonly pushed?: boolean;
}) => {
  const isFocused = useIsFocused();
  const { boxRef, mark } = useSceneMark(isFocused, pushed);
  return (
    <ScreenActive isActive={isFocused}>
      <View {...MARKS[mark]} ref={boxRef} style={isFocused ? SHOWN : HIDDEN}>
        <SearchParamsScene params={route?.params}>{children}</SearchParamsScene>
      </View>
    </ScreenActive>
  );
};

/** `ScreenScene` as a navigator's `screenLayout`: one function, so the navigator's props stay the same. */
export const sceneLayout = ({ children, route }: SceneProps): ReactElement => (
  <ScreenScene route={route}>{children}</ScreenScene>
);

/** The same, for a stack: its screens play the route transition. */
export const pushedSceneLayout = ({ children, route }: SceneProps): ReactElement => (
  <ScreenScene pushed route={route}>
    {children}
  </ScreenScene>
);
