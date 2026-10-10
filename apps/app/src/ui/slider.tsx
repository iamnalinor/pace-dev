import { useState } from "react";
import { type AccessibilityActionEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import type { SliderProps } from "./slider-props.ts";

import { cx } from "./cx.ts";

const THUMB = 26;

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

/**
A volume-style slider: drag the thumb or tap anywhere on the track; the value snaps to whole
steps and is committed when the finger lifts. TalkBack reads it as adjustable.
*/
export const Slider = ({ label, max, onChange, value }: SliderProps) => {
  const [width, setWidth] = useState(1);
  const [draft, setDraft] = useState<null | number>(null);
  const stepAt = (x: number): number => clamp(Math.round(((x - THUMB / 2) / width) * max), max);
  const pan = Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onBegin((event) => {
      setDraft(stepAt(event.x));
    })
    .onUpdate((event) => {
      setDraft(stepAt(event.x));
    })
    .onEnd((event) => {
      const next = stepAt(event.x);
      if (next !== value) {
        onChange(next);
      }
    })
    .onFinalize(() => {
      setDraft(null);
    });
  const shown = draft ?? value;
  const share = max === 0 ? 0 : shown / max;
  const onAction = (event: AccessibilityActionEvent): void => {
    const next = clamp(value + (event.nativeEvent.actionName === "increment" ? 1 : -1), max);
    if (next !== value) {
      onChange(next);
    }
  };
  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessible
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={shown}
        className="h-11 justify-center"
        hitSlop={8}
        onAccessibilityAction={onAction}
        onLayout={(event) => {
          setWidth(Math.max(event.nativeEvent.layout.width - THUMB, 1));
        }}
      >
        <View className="mx-[13px] h-2 rounded-full bg-track">
          <View className="h-2 rounded-full bg-fg" style={{ width: `${share * 100}%` }} />
        </View>
        <View
          className={cx(
            "absolute h-[26px] w-[26px] rounded-full border-2 border-fg bg-surface",
            draft !== null && "scale-110",
          )}
          style={{ left: share * width }}
        />
      </View>
    </GestureDetector>
  );
};
