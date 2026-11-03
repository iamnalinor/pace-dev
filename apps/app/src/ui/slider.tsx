import { useState } from "react";
import { type AccessibilityActionEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { type SliderProps, useShownStep } from "./slider-props.ts";

/** The thumb's diameter (`icon.bar`, 24): the track is inset by half of it at each end. */
const THUMB = 24;

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

/**
A volume-style slider (spec §4.2.24): drag the thumb or tap anywhere on the track; the value
follows the finger in whole steps, with no animation and no jump in size (F-MOT-14), and is
committed when the finger lifts (`onSlide` reports each step on the way). The released step stays
until the store answers, so it never snaps back. A 4 high `fill.4` track filled in `label.primary`
and a 24 `label.primary` thumb in a 2 px `bg.cell` ring, in the 48 dp target. TalkBack reads it as
adjustable, with the readout's words.
*/
export const Slider = ({ label, max, onChange, onSlide, value, valueText }: SliderProps) => {
  const [width, setWidth] = useState(1);
  const { release, setDraft, shown } = useShownStep(value);
  const slideTo = (next: null | number): void => {
    setDraft(next);
    onSlide?.(next);
  };
  const stepAt = (x: number): number => clamp(Math.round(((x - THUMB / 2) / width) * max), max);
  const pan = Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onBegin((event) => {
      slideTo(stepAt(event.x));
    })
    .onUpdate((event) => {
      slideTo(stepAt(event.x));
    })
    .onEnd((event) => {
      // `value` follows the finger (the readouts), so every release is reported.
      const step = stepAt(event.x);
      release(step);
      onChange(step);
    })
    .onFinalize(() => {
      // A cancelled drag lets go of its step too; a finished one is held by `release`.
      slideTo(null);
    });
  const share = max === 0 ? 0 : shown / max;
  const onAction = (event: AccessibilityActionEvent): void => {
    const next = clamp(value + (event.nativeEvent.actionName === "increment" ? 1 : -1), max);
    if (next === value) {
      return;
    }

    release(next);
    onChange(next);
  };
  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityValue={{
          max,
          min: 0,
          now: shown,
          ...(valueText !== undefined && { text: valueText(shown) }),
        }}
        accessible
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={shown}
        className="min-h-hit justify-center"
        onAccessibilityAction={onAction}
        onLayout={(event) => {
          setWidth(Math.max(event.nativeEvent.layout.width - THUMB, 1));
        }}
      >
        <View className="mx-3 h-1 rounded-pill bg-fill-4">
          <View
            className="h-1 rounded-pill bg-label-primary"
            style={{ width: `${share * 100}%` }}
          />
        </View>
        <View
          className="absolute size-6 rounded-pill border-2 border-cell bg-label-primary"
          style={{ left: share * width }}
          testID="slider-thumb"
        />
      </View>
    </GestureDetector>
  );
};
