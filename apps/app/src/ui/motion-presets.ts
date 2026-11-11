import { Easing, ReduceMotion } from "react-native-reanimated";

import { motion, space } from "@pace/core";

const bezier = ([x1 = 0, y1 = 0, x2 = 1, y2 = 1]: readonly number[]) =>
  Easing.bezier(x1, y1, x2, y2);

/** The motion tokens' curves (spec §3.8): `enter` ease-out, `exit` ease-in, `move` in place. */
export const EASING = {
  enter: bezier(motion.easing.enter),
  exit: bezier(motion.easing.exit),
  move: bezier(motion.easing.move),
} as const;

/**
A timed animation's settings. The kit picks its reduced variant itself (a fade of
`reduced.fade` in place of travel and scale, spec §3.8), so Reanimated must not skip the animation
on its own: its default (`ReduceMotion.System`) jumps to the end under reduced motion, and the
fade that was to stand in for the motion never showed (bug-lessons 366).
*/
export const timing = (duration: number, curve: keyof typeof EASING) =>
  ({ duration, easing: EASING[curve], reduceMotion: ReduceMotion.Never }) as const;

/**
How a `Presence` comes and goes (spec §6): `fade`; `lift` (4 up + fade, the assistant's preview);
`rise` (8 up + fade, the toast's enter); `drop` (4 + fade on the long timing, the toast's exit); `scale` (0.96 → 1 + fade, a dialog); `slide` (16 in from the
trailing edge + fade, the inspector).
*/
export type PresencePreset = "drop" | "fade" | "lift" | "rise" | "scale" | "slide";

/** Where a preset starts its enter (and ends its exit): fully transparent, moved or shrunk by this much. */
export type PresenceFrom = {
  readonly opacity: 0;
  readonly translateX?: number;
  readonly translateY?: number;
  readonly scale?: number;
};

/** Never from scale 0 (F-MOT-06): a dialog grows from 96 %. */
const SCALE_FROM = 0.96;

const FROM: Readonly<Record<PresencePreset, PresenceFrom>> = {
  drop: { opacity: 0, translateY: space["2"] },
  fade: { opacity: 0 },
  lift: { opacity: 0, translateY: space["2"] },
  rise: { opacity: 0, translateY: space["3"] },
  scale: { opacity: 0, scale: SCALE_FROM },
  slide: { opacity: 0, translateX: space["5"] },
};

/**
A preset's starting frame. Reduced motion replaces travel and scale with the fade alone (spec §3.8
`reduced`), never with nothing: the change still shows.
*/
export const presenceFrom = (preset: PresencePreset, isReduced: boolean): PresenceFrom =>
  isReduced ? FROM.fade : FROM[preset];

/** The short presets (160 in / 110 out); the rest are 220 / 160 (exits are 0.7 × enter). */
const SHORT: ReadonlySet<PresencePreset> = new Set(["fade", "lift"]);

/** A preset's enter and exit durations; reduced motion fades in `duration.sm`. */
export const presenceTiming = (
  preset: PresencePreset,
  isReduced: boolean,
): { readonly enter: number; readonly exit: number } => {
  if (isReduced) {
    return { enter: motion.reduced.fade, exit: motion.reduced.fade };
  }
  return SHORT.has(preset)
    ? { enter: motion.duration.sm, exit: motion.exit.sm }
    : { enter: motion.duration.md, exit: motion.exit.md };
};
