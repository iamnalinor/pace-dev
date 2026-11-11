import { type ReactNode, useEffect, useRef } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { timing } from "./motion-presets.ts";
import { ROW_MOTION } from "./motion.ts";
import { useIsMotionReduced } from "./use-reduced-motion.ts";

/** The box's height while it is not closing up: its own. */
const OWN_HEIGHT = -1;

/**
A checked row leaving (spec §6 "check a task"): its content fades (160 ms, the owner's plain fade,
Q2) while the box closes up to nothing (220 ms), so the rows below move up continuously, by the
same primitive on Android and the web (F-MOT-02). `onDone` runs from the last animation's
completion, never from a timer (F-MOT-03). Reduced motion keeps the fade and closes up at once
when it ends: the row is never blank while it still takes its place. Made inactive again (a
refused close), the row is back as it was.
*/
export const Dissolve = ({
  children,
  isActive,
  onDone,
}: {
  readonly children: ReactNode;
  readonly isActive: boolean;
  readonly onDone: () => void;
}) => {
  const isReduced = useIsMotionReduced();
  const opacity = useSharedValue(1);
  const height = useSharedValue(OWN_HEIGHT);
  const measuredRef = useRef(0);
  // The latest `onDone`: a new closure each render must not restart the run.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    if (!isActive) {
      opacity.set(1);
      height.set(OWN_HEIGHT);
      return;
    }
    const finish = (): void => {
      onDoneRef.current();
    };
    const whenFinished = (isFinished?: boolean): void => {
      "worklet";
      // Taken over (the row was put back): nothing is done.
      if (isFinished === true) {
        scheduleOnRN(finish);
      }
    };
    const { checkFade, closeUp } = ROW_MOTION;
    opacity.set(
      withTiming(
        0,
        timing(isReduced ? checkFade.reduced : checkFade.duration, checkFade.easing),
        isReduced ? whenFinished : undefined,
      ),
    );
    if (isReduced) {
      return;
    }
    height.set(measuredRef.current);
    height.set(withTiming(0, timing(closeUp.duration, closeUp.easing), whenFinished));
  }, [height, isActive, isReduced, opacity]);
  const style = useAnimatedStyle(() => {
    const own = height.get();
    return own < 0
      ? { opacity: opacity.get() }
      : { height: own, opacity: opacity.get(), overflow: "hidden" };
  });
  return (
    <Animated.View
      onLayout={(event) => {
        // The row's own height, kept from before the close-up starts shrinking it.
        if (!isActive) {
          measuredRef.current = event.nativeEvent.layout.height;
        }
      }}
      style={style}
    >
      {children}
    </Animated.View>
  );
};
