import { type ReactNode, useState } from "react";
import { type AccessibilityActionEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useT } from "#app/app-state.tsx";

/** Holding a row this long picks it up; a shorter touch stays a tap or a scroll. */
const PICK_UP_MS = 350;
const SETTLE_MS = 150;

/**
A Now row that can be moved inside its importance category: long-press and drag it
(`onDrag` gets the rows passed, signed), or use the screen reader's "Move up" / "Move down"
actions (`onStep` gets -1 or 1).
*/
export const DraggableRow = ({
  children,
  onDrag,
  onStep,
  testID,
}: {
  readonly children: ReactNode;
  readonly onDrag: (rowsMoved: number) => void;
  readonly onStep: (step: -1 | 1) => void;
  readonly testID: string;
}) => {
  const t = useT();
  const [height, setHeight] = useState(1);
  const offset = useSharedValue(0);
  const lifted = useSharedValue(0);
  const drop = (translation: number): void => {
    onDrag(Math.round(translation / height));
  };
  const drag = Gesture.Pan()
    .activateAfterLongPress(PICK_UP_MS)
    .onStart(() => {
      lifted.value = 1;
    })
    .onUpdate((event) => {
      offset.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(drop)(event.translationY);
    })
    .onFinalize(() => {
      offset.value = withTiming(0, { duration: SETTLE_MS });
      lifted.value = 0;
    });
  const style = useAnimatedStyle(() => ({
    opacity: lifted.value === 1 ? 0.9 : 1,
    transform: [{ translateY: offset.value }],
    zIndex: lifted.value,
  }));
  const onAction = (event: AccessibilityActionEvent): void => {
    onStep(event.nativeEvent.actionName === "moveUp" ? -1 : 1);
  };
  return (
    <GestureDetector gesture={drag}>
      <Animated.View style={style}>
        <View
          accessibilityActions={[
            { label: t("now.moveUp"), name: "moveUp" },
            { label: t("now.moveDown"), name: "moveDown" },
          ]}
          onAccessibilityAction={onAction}
          onLayout={(event) => {
            setHeight(Math.max(event.nativeEvent.layout.height, 1));
          }}
          testID={testID}
        >
          {children}
        </View>
      </Animated.View>
    </GestureDetector>
  );
};
