import { Easing } from "react-native-reanimated";

import { motion, space } from "@pace/core";

const bezier = ([x1 = 0, y1 = 0, x2 = 1, y2 = 1]: readonly number[]) =>
  Easing.bezier(x1, y1, x2, y2);

/** The motion tokens' curves (spec §3.8): `enter` ease-out, `exit` ease-in, `move` in place. */
export const EASING = {
  enter: bezier(motion.easing.enter),
  exit: bezier(motion.easing.exit),
  move: bezier(motion.easing.move),
} as const;

/** How a `Presence` comes and goes (spec §6): `fade`, `rise` (8 up, fade) or `scale` (0.96 → 1, fade). */
export type PresencePreset = "fade" | "rise" | "scale";

/** Where a preset starts its enter (and ends its exit): fully transparent, moved or shrunk by this much. */
export type PresenceFrom = {
  readonly opacity: 0;
  readonly translateY?: number;
  readonly scale?: number;
};

/** Never from scale 0 (F-MOT-06): a dialog grows from 96 %. */
const SCALE_FROM = 0.96;

/**
A preset's starting frame. Reduced motion replaces travel and scale with the fade alone (spec §3.8
`reduced`), never with nothing: the change still shows.
*/
export const presenceFrom = (preset: PresencePreset, isReduced: boolean): PresenceFrom => {
  if (isReduced || preset === "fade") {
    return { opacity: 0 };
  }
  return preset === "rise"
    ? { opacity: 0, translateY: space["3"] }
    : { opacity: 0, scale: SCALE_FROM };
};

/** A preset's enter and exit durations (exits are 0.7 × enter); reduced motion fades in `duration.sm`. */
export const presenceTiming = (
  preset: PresencePreset,
  isReduced: boolean,
): { readonly enter: number; readonly exit: number } => {
  if (isReduced) {
    return { enter: motion.reduced.fade, exit: motion.reduced.fade };
  }
  return preset === "fade"
    ? { enter: motion.duration.sm, exit: motion.exit.sm }
    : { enter: motion.duration.md, exit: motion.exit.md };
};
