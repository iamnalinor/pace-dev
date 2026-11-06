import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { EASING } from "#app/ui/motion-presets.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { useIsMotionReduced } from "#app/ui/use-reduced-motion.ts";
import { motion } from "@pace/core";

const shown: { marked: ReadonlySet<string> } = { marked: new Set() };
const listeners = new Set<() => void>();

const publish = (next: ReadonlySet<string>): void => {
  shown.marked = next;
  for (const listener of listeners) {
    listener();
  }
};

/**
The rows an approved proposal just created: each one carries the highlight once, then it is
forgotten (a row scrolled back into view later is not marked again).
*/
export const markAccepted = (ids: readonly string[]): void => {
  if (ids.length === 0) {
    return;
  }
  publish(new Set([...shown.marked, ...ids]));
  setTimeout(() => {
    publish(new Set([...shown.marked].filter((id) => !ids.includes(id))));
  }, motion.highlight);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const useIsAccepted = (id: string): boolean =>
  useSyncExternalStore(
    subscribe,
    () => shown.marked.has(id),
    () => false,
  );

const WASH = { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } as const;

/** The wash in `accent.quiet`: fades to nothing over 600 ms; under reduced motion it stays, then goes. */
const Wash = () => {
  const { palette } = useTheme();
  const isReduced = useIsMotionReduced();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!isReduced) {
      opacity.set(withTiming(0, { duration: motion.highlight, easing: EASING.exit }));
    }
  }, [isReduced, opacity]);
  const style = useAnimatedStyle(() => ({
    backgroundColor: palette.accentQuiet,
    opacity: opacity.get(),
  }));
  return <Animated.View pointerEvents="none" style={[WASH, style]} testID="accepted-highlight" />;
};

/** A row that carries the highlight while it is the one an approval just created. */
export const AcceptedHighlight = ({
  children,
  id,
}: {
  readonly children: ReactNode;
  readonly id: string;
}) => {
  const isAccepted = useIsAccepted(id);
  return (
    <View>
      {children}
      {isAccepted ? <Wash /> : null}
    </View>
  );
};
