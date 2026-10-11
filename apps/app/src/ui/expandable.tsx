import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** Long enough to see the form unfold, short enough not to wait for it. */
const DURATION_MS = 220;

const CLIP = { overflow: "hidden" } as const;
const MEASURED = { left: 0, position: "absolute", right: 0, top: 0 } as const;

/**
Unfolds its content downwards and folds it back up: the height follows the content as it
is measured, the content fades in with it. It stays mounted while it folds, then leaves.
Reduced motion skips the animation.
*/
export const Expandable = ({
  children,
  isOpen,
}: {
  readonly children: ReactNode;
  readonly isOpen: boolean;
}) => {
  const [height, setHeight] = useState(0);
  const [isMounted, setIsMounted] = useState(isOpen);
  const [wasOpen, setWasOpen] = useState(isOpen);
  // Opening mounts the content in the same render; closing keeps it until the fold is done.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setIsMounted(true);
    }
  }
  const share = useSharedValue(isOpen ? 1 : 0);
  useEffect(() => {
    share.value = withTiming(isOpen ? 1 : 0, {
      duration: DURATION_MS,
      reduceMotion: ReduceMotion.System,
    });
    if (isOpen) {
      return;
    }
    const timer = setTimeout(() => {
      setIsMounted(false);
    }, DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, share]);
  const style = useAnimatedStyle(() => ({ height: height * share.value, opacity: share.value }));
  if (!isMounted) {
    return null;
  }
  return (
    <Animated.View style={[CLIP, style]}>
      <View
        onLayout={(event) => {
          setHeight(event.nativeEvent.layout.height);
        }}
        style={MEASURED}
      >
        {children}
      </View>
    </Animated.View>
  );
};
