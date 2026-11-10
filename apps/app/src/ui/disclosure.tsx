import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useLanguage } from "#app/app-state.tsx";
import { formatCount, motion } from "@pace/core";

import { cx } from "./cx.ts";
import { Icon } from "./icon.tsx";
import { EASING } from "./motion-presets.ts";
import { Pressable } from "./pressable.tsx";
import { Text } from "./text.tsx";
import { useIsMotionReduced } from "./use-reduced-motion.ts";

/** The open content is clipped to its animated height. */
const CLIP = { overflow: "hidden" } as const;

/**
Where the content is: `shown` (open and settled: its height is its own), `opening` (growing to
its measured height), `closing` (shrinking away, still mounted, hidden from assistive tech) or
`gone` (closed: nothing is mounted, so nothing in it can be reached).
*/
type Phase = "closing" | "gone" | "opening" | "shown";

/** The trigger's chevron: a quarter turn when open, on the in-place curve. */
const Chevron = ({
  isOpen,
  isReduced,
}: {
  readonly isOpen: boolean;
  readonly isReduced: boolean;
}) => {
  const turn = useSharedValue(isOpen ? 1 : 0);
  useEffect(() => {
    const to = isOpen ? 1 : 0;
    // Reduced motion: the chevron simply points the new way (a turn is travel, §3.8).
    turn.set(
      isReduced ? to : withTiming(to, { duration: motion.duration.md, easing: EASING.move }),
    );
  }, [isOpen, isReduced, turn]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${String(turn.get() * 90)}deg` }],
  }));
  return (
    <Animated.View style={style} testID="disclosure-chevron">
      <Icon name="chevron-right" size="inline" />
    </Animated.View>
  );
};

/** The two values the content's box animates, and what it animates to or from. */
type Box = {
  readonly height: SharedValue<number>;
  readonly opacity: SharedValue<number>;
  readonly measured: number;
  readonly isReduced: boolean;
};

/** Grows the box to the measured height while it fades in, then calls `onDone` (on the JS side). */
const startGrow = ({ height, isReduced, measured, opacity }: Box, onDone: () => void): void => {
  const duration = isReduced ? motion.reduced.fade : motion.duration.md;
  height.set(isReduced ? measured : withTiming(measured, { duration, easing: EASING.move }));
  opacity.set(
    withTiming(1, { duration, easing: EASING.move }, (isFinished) => {
      if (isFinished === true) {
        scheduleOnRN(onDone);
      }
    }),
  );
};

/**
Where a close starts: a settled box from the content's current height (it may have grown while
open; a stale one clips the first frame, bug class 5), a box still growing from the height it has
reached (from the full height it would jump open before it shrank).
*/
export const shrinkFrom = ({
  current,
  measured,
  phase,
}: {
  readonly current: number;
  readonly measured: number;
  readonly phase: Phase;
}): number => (phase === "opening" ? current : measured);

/** Shrinks the box from `from` while it fades out, then calls `onDone`. */
const startShrink = (
  { from, height, isReduced, opacity }: Box & { readonly from: number },
  onDone: () => void,
): void => {
  const duration = isReduced ? motion.reduced.fade : motion.exit.md;
  // The value is set first, so the animation starts from it in the same frame (a 0 ms timing step
  // would cost that frame: parked N2).
  height.set(from);
  if (!isReduced) {
    height.set(withTiming(0, { duration, easing: EASING.exit }));
  }
  opacity.set(
    withTiming(0, { duration, easing: EASING.exit }, (isFinished) => {
      if (isFinished === true) {
        scheduleOnRN(onDone);
      }
    }),
  );
};

/** The phase `isOpen` asks for, moved in the render that asks (never an effect later). */
const usePhase = (isOpen: boolean) => {
  const [phase, setPhase] = useState<Phase>(isOpen ? "shown" : "gone");
  if (isOpen && (phase === "gone" || phase === "closing")) {
    setPhase("opening");
  }
  if (!isOpen && (phase === "shown" || phase === "opening")) {
    setPhase("closing");
  }
  return [phase, setPhase] as const;
};

/**
The content's box: its height grows from 0 to the content's measured height while it fades in,
and shrinks back while it fades out (spec §6 disclosure: 220 in on `easing.move`, 160 out on
`easing.exit`); once grown, the height is the content's own again. Reduced motion jumps the
height and keeps the fade (`duration.sm`).
*/
const useContentMotion = (isOpen: boolean, onShown: (() => void) | undefined) => {
  const isReduced = useIsMotionReduced();
  const [phase, setPhase] = usePhase(isOpen);
  const height = useSharedValue(0);
  const opacity = useSharedValue(isOpen ? 1 : 0);
  const measuredRef = useRef(0);
  const startedRef = useRef<Phase>(phase);
  const onShownRef = useRef(onShown);
  useEffect(() => {
    onShownRef.current = onShown;
  });
  const settle = useCallback((): void => {
    setPhase("shown");
    onShownRef.current?.();
  }, [setPhase]);
  useEffect(() => {
    // Each phase starts its animation once, whatever else changes meanwhile.
    if (startedRef.current === phase) {
      return;
    }
    const previous = startedRef.current;
    startedRef.current = phase;
    const box = { height, isReduced, measured: measuredRef.current, opacity };
    // Opened again while it closed: no new layout comes (its size is the same), so it grows
    // back to what was measured; a changed size measures again and grows from there.
    if (phase === "opening" && measuredRef.current > 0) {
      startGrow(box, settle);
    }
    if (phase !== "closing") {
      return;
    }
    const from = shrinkFrom({ current: height.get(), measured: box.measured, phase: previous });
    startShrink({ ...box, from }, () => {
      setPhase("gone");
    });
  }, [height, isReduced, opacity, phase, setPhase, settle]);
  const isClamped = phase === "opening" || (phase === "closing" && !isReduced);
  const style = useAnimatedStyle(
    () =>
      isClamped ? { height: height.get(), opacity: opacity.get() } : { opacity: opacity.get() },
    [isClamped],
  );
  const onLayout = (measured: number): void => {
    if (measured <= 0) {
      return;
    }
    const isNew = measured !== measuredRef.current;
    measuredRef.current = measured;
    if (phase === "shown") {
      // Kept in step with the content while it is open, so a close starts from its real height.
      height.set(measured);
    }
    if (phase === "opening" && isNew) {
      startGrow({ height, isReduced, measured, opacity }, settle);
    }
  };
  return { onLayout, phase, style };
};

export type DisclosureProps = {
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The trigger's words (sentence case, as written: «В будущем», "Done"). */
  readonly label: string;
  /** How many the content holds, after the label (`formatCount`, tabular). */
  readonly count?: number | undefined;
  /** The content is laid out and grown: move focus into it here, with `preventScroll`. */
  readonly onShown?: (() => void) | undefined;
  readonly children: ReactNode;
  readonly testID?: string | undefined;
  /**
  Where the trigger's label starts: `row` (default) at a list row's text inset, `edge` on its
  container's own edge (the time bar's «Start something else», in line with the card and the
  tiles: design review 2 N3).
  */
  readonly inset?: "edge" | "row" | undefined;
};

/**
One disclosure for every fold (spec §4.1.1, §6; F-MOT-10): «В будущем · 3», «Готово · 11», "Show
all". The trigger is a button that says expanded or collapsed, with the label, the count and one
`chevron-right` that turns a quarter when open. The content is measured before it grows to its
height while fading in; closed, it is unmounted, and while it closes it is hidden from assistive
tech and takes no touches.
*/
export const Disclosure = ({
  children,
  count,
  inset = "row",
  label,
  onShown,
  onToggle,
  open,
  testID,
}: DisclosureProps) => {
  const language = useLanguage();
  const isReduced = useIsMotionReduced();
  const content = useContentMotion(open, onShown);
  return (
    <View testID={testID}>
      <Pressable
        className={cx(
          "flex-row items-center gap-2 rounded-md",
          inset === "row" && "mx-gutter px-row-x",
        )}
        expanded={open}
        label={count === undefined ? label : `${label} · ${formatCount(count, language)}`}
        onPress={onToggle}
        role="button"
      >
        <Text role="subhead" tone="secondary">
          {label}
        </Text>
        {count === undefined ? null : (
          <Text numeric role="subhead" tone="secondary">
            {formatCount(count, language)}
          </Text>
        )}
        <Chevron isOpen={open} isReduced={isReduced} />
      </Pressable>
      {content.phase === "gone" ? null : (
        <Animated.View
          aria-hidden={content.phase === "closing"}
          pointerEvents={content.phase === "closing" ? "none" : "auto"}
          // The clip in the style: a reanimated view takes no className on the web (bug-lessons 148).
          style={[content.style, CLIP]}
          {...(content.phase === "closing" && {
            importantForAccessibility: "no-hide-descendants" as const,
          })}
        >
          <View
            onLayout={(event) => {
              content.onLayout(event.nativeEvent.layout.height);
            }}
            testID="disclosure-content"
          >
            {children}
          </View>
        </Animated.View>
      )}
    </View>
  );
};
