import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { EASING } from "#app/ui/motion-presets.ts";
import { useIsMotionReduced } from "#app/ui/use-reduced-motion.ts";
import { motion } from "@pace/core";

export type ComposerShape = "form" | "line";

/** Clips the content while the frame grows to it. */
const CLIP = { overflow: "hidden" } as const;

/**
Where the unfold is: `idle` (the content is simply there), `out` (the form fades out before it
folds), `grow` (the card moves to the new content's height, which is laid out at opacity 0),
`in` (the new content fades in).
*/
export type Phase = "grow" | "idle" | "in" | "out";

/** The shape's content shown now, the shape asked for, and the phase the change is in. */
type UnfoldState = {
  readonly phase: Phase;
  readonly shape: ComposerShape;
  readonly target: ComposerShape;
};

const useUnfoldState = (shape: ComposerShape) => {
  const [state, setState] = useState<UnfoldState>({ phase: "idle", shape, target: shape });
  if (state.target !== shape) {
    // Asked again while it moves: no second height animation, the new content simply fades in.
    if (state.phase !== "idle") {
      setState({ phase: "in", shape, target: shape });
    } else if (shape === "form") {
      // The line opens into the form: the card grows first, the form is there at opacity 0.
      setState({ phase: "grow", shape, target: shape });
    } else {
      // The form folds back: it fades out first, then the card shrinks to the line.
      setState({ ...state, phase: "out", target: shape });
    }
  }
  return [state, setState] as const;
};

/** Where an animation goes, how long it takes and on what curve. */
type Timing = {
  readonly duration: number;
  readonly easing: (typeof EASING)[keyof typeof EASING];
  readonly to: number;
};

/** Moves `value` to `to` and, once that has finished (never a timer, F-MOT-03), calls `then`. */
const animate = (
  value: SharedValue<number>,
  { duration, easing, to }: Timing,
  then: () => void,
): void => {
  value.set(
    withTiming(to, { duration, easing }, (isFinished) => {
      if (isFinished === true) {
        scheduleOnRN(then);
      }
    }),
  );
};

/** The fades: the form's out before it folds, the new content's in once the card has its height. */
const useFades = (
  { phase }: { readonly phase: Phase },
  opacity: SharedValue<number>,
  setState: Dispatch<SetStateAction<UnfoldState>>,
): void => {
  const isReduced = useIsMotionReduced();
  useEffect(() => {
    switch (phase) {
      case "grow": {
        opacity.set(0);
        break;
      }
      case "in": {
        opacity.set(0);
        const duration = isReduced ? motion.reduced.fade : motion.duration.xs;
        animate(opacity, { duration, easing: EASING.enter, to: 1 }, () => {
          setState((current) => ({ ...current, phase: "idle" }));
        });
        break;
      }
      case "out": {
        const duration = isReduced ? motion.reduced.fade : motion.exit.sm;
        animate(opacity, { duration, easing: EASING.exit, to: 0 }, () => {
          setState((current) => ({ ...current, phase: "grow", shape: current.target }));
        });
        break;
      }
      case "idle": {
        break;
      }
    }
  }, [isReduced, opacity, phase, setState]);
};

/** The content's layout: kept while idle, and the height the grow moves the card to. */
const useGrow = (
  { phase }: { readonly phase: Phase },
  height: SharedValue<number>,
  setState: Dispatch<SetStateAction<UnfoldState>>,
) => {
  const isReduced = useIsMotionReduced();
  const isMovingRef = useRef(false);
  useEffect(() => {
    if (phase === "grow") {
      isMovingRef.current = false;
    }
  }, [phase]);
  return useCallback(
    (measured: number): void => {
      if (phase !== "grow") {
        if (measured > 0) {
          height.set(measured);
        }
        return;
      }
      if (isMovingRef.current) {
        return;
      }
      isMovingRef.current = true;
      const toIn = (): void => {
        setState((current) => (current.phase === "grow" ? { ...current, phase: "in" } : current));
      };
      if (isReduced || measured <= 0) {
        height.set(measured);
        toIn();
        return;
      }
      animate(height, { duration: motion.duration.sm, easing: EASING.enter, to: measured }, toIn);
    },
    [height, isReduced, phase, setState],
  );
};

/**
The composer's unfold (spec §6 "composer unfold"; F-MOT-08, bug-lessons 5): the card never clips
what it shows. Opening, it grows 160 ms on `easing.enter` to the form's measured height while the
form, laid out at once, is at opacity 0; then the form fades in. Closing, the form fades out in
110 ms, the card shrinks 160 ms to the line, and the line fades in. A field at opacity 0 still
takes the cursor. Reduced motion: no height travel, the content only fades (`duration.sm`). On the
first render the content is simply there (F-MOT-07).
*/
export const useComposerUnfold = (shape: ComposerShape) => {
  const [state, setState] = useUnfoldState(shape);
  const height = useSharedValue(0);
  const opacity = useSharedValue(1);
  const { phase } = state;
  useFades(state, opacity, setState);
  const onLayout = useGrow(state, height, setState);
  const isGrowing = phase === "grow";
  const frameStyle = useAnimatedStyle(
    () => (isGrowing ? { height: height.get() } : {}),
    [isGrowing],
  );
  const contentStyle = useAnimatedStyle(
    () => (phase === "idle" ? {} : { opacity: isGrowing ? 0 : opacity.get() }),
    [isGrowing, phase],
  );
  return { contentStyle, frameStyle, onLayout, phase, shape: state.shape };
};

/** The frame that clips only while the card moves, and the content that fades. */
export const ComposerUnfold = ({
  children,
  contentStyle,
  frameStyle,
  onLayout,
  phase,
  shape,
}: {
  readonly shape: ComposerShape;
  readonly children: ReactNode;
  readonly contentStyle: ReturnType<typeof useAnimatedStyle>;
  readonly frameStyle: ReturnType<typeof useAnimatedStyle>;
  readonly onLayout: (height: number) => void;
  readonly phase: Phase;
}) => (
  // The clip in the style: a reanimated view takes no className on the web (bug-lessons 148).
  <Animated.View style={[frameStyle, phase === "grow" && CLIP]}>
    <Animated.View
      // Keyed by the content: its layout is reported each time the shape changes.
      key={shape}
      onLayout={(event) => {
        onLayout(event.nativeEvent.layout.height);
      }}
      pointerEvents={phase === "out" ? "none" : "auto"}
      style={contentStyle}
    >
      {children}
    </Animated.View>
  </Animated.View>
);
