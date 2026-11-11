import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";

import { motion } from "@pace/core";

import { EASING } from "./motion-presets.ts";

/*
The rows' motion, in one place (spec §3.8, §6): every duration and curve is a motion token, nothing
runs past 300 ms, and every step names its curve (F-MOT-04). The overlays' pairs are in
`overlay-motion.ts`, a `Presence`'s presets in `motion-presets.ts`.
*/

/** The steps as data: which token times each, and on which curve. */
export const ROW_MOTION = {
  /** A checked row's content fading away; as long under reduced motion (never zero, F-MOT-03). */
  checkFade: { duration: motion.duration.sm, easing: "exit", reduced: motion.reduced.fade },
  /** The rows below closing up over a row that left. */
  closeUp: { duration: motion.duration.md, easing: "move" },
  enter: { duration: motion.duration.sm, easing: "enter" },
  exit: { duration: motion.exit.sm, easing: "exit" },
} as const;

/** A row a user action added to the open screen (a logged block on Day). */
export const ROW_ENTER = FadeIn.duration(ROW_MOTION.enter.duration)
  .easing(EASING[ROW_MOTION.enter.easing])
  .reduceMotion(ReduceMotion.System);

/** A row a user action took away. */
export const ROW_EXIT = FadeOut.duration(ROW_MOTION.exit.duration)
  .easing(EASING[ROW_MOTION.exit.easing])
  .reduceMotion(ReduceMotion.System);

/** The rows below sliding into the freed or taken place. */
export const ROW_LAYOUT = LinearTransition.duration(ROW_MOTION.closeUp.duration)
  .easing(EASING[ROW_MOTION.closeUp.easing])
  .reduceMotion(ReduceMotion.System);

/**
One half of a placeholder's breath (a skeleton while a list loads): it dims and comes back,
and stands still under reduced motion.
*/
export const PLACEHOLDER_BREATH = {
  duration: motion.breath,
  reduceMotion: ReduceMotion.System,
} as const;
