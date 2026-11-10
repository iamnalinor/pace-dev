import type { ViewProps } from "react-native";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { EASING, presenceFrom, type PresencePreset, presenceTiming } from "./motion-presets.ts";
import { useIsMotionReduced } from "./use-reduced-motion.ts";

export type PresenceProps = Pick<ViewProps, "className" | "pointerEvents" | "testID"> & {
  readonly children: ReactNode;
  /** Shown, or on its way out: it stays mounted until its exit has finished. */
  readonly show: boolean;
  readonly enter?: PresencePreset;
  /** The exit's preset; the enter's unless told. */
  readonly exit?: PresencePreset;
  /** Enter on the first render too; by default what is there at first is simply there (F-MOT-07). */
  readonly initial?: boolean;
  /** Called from the exit animation's completion (never a timer, F-MOT-03), once it has let go. */
  readonly onExited?: () => void;
};

/** Leaving, it takes no touches: a press during the exit would act on what is going away (parked N4). */
const LEAVING = { pointerEvents: "none" } as const;

const leavingProps = (isShown: boolean) => (isShown ? undefined : LEAVING);

/**
Mounts and unmounts its children with a paired preset (spec §4.1.1, §6): it enters on the enter
curve, and keeps the children through its exit on the exit curve, letting go (and calling
`onExited`) only when that animation reports it has finished; while it leaves it takes no
touches. Nothing animates on the first render. Reduced motion turns every preset into a fade of `duration.sm`.
*/
export const Presence = ({
  children,
  enter = "fade",
  exit = enter,
  initial = false,
  onExited,
  show,
  ...rest
}: PresenceProps) => {
  const isReduced = useIsMotionReduced();
  const [isMounted, setIsMounted] = useState(show);
  // Shown again: mounted at once, in this render (not an effect later).
  if (show && !isMounted) {
    setIsMounted(true);
  }
  const progress = useSharedValue(show && !initial ? 1 : 0);
  // The `show` the last animation answered; undefined before the first render's effect.
  const answeredRef = useRef<boolean | undefined>(undefined);
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });
  useEffect(() => {
    const answered = answeredRef.current;
    answeredRef.current = show;
    // Only a change of `show` animates (a preset or the reduced flag changing does not replay it);
    // the first render enters only when told (`initial`).
    if (answered === show || (answered === undefined && !(show && initial))) {
      return;
    }
    if (show) {
      const { enter: duration } = presenceTiming(enter, isReduced);
      progress.set(withTiming(1, { duration, easing: EASING.enter }));
      return;
    }
    const letGo = (): void => {
      setIsMounted(false);
      onExitedRef.current?.();
    };
    const { exit: duration } = presenceTiming(exit, isReduced);
    progress.set(
      withTiming(0, { duration, easing: EASING.exit }, (isFinished) => {
        // Shown again before the exit finished: the enter took over, nothing lets go.
        if (isFinished === true) {
          scheduleOnRN(letGo);
        }
      }),
    );
  }, [enter, exit, initial, isReduced, progress, show]);
  const from = presenceFrom(show ? enter : exit, isReduced);
  const style = useAnimatedStyle(() => {
    const step = progress.get();
    const away = 1 - step;
    if (from.translateX !== undefined) {
      return { opacity: step, transform: [{ translateX: away * from.translateX }] };
    }
    if (from.translateY !== undefined) {
      return { opacity: step, transform: [{ translateY: away * from.translateY }] };
    }
    return from.scale === undefined
      ? { opacity: step }
      : { opacity: step, transform: [{ scale: from.scale + (1 - from.scale) * step }] };
  }, [from.scale, from.translateX, from.translateY]);
  return isMounted ? (
    <Animated.View {...rest} {...leavingProps(show)} style={style}>
      {children}
    </Animated.View>
  ) : null;
};
