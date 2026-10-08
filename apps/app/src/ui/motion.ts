import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";

/*
The app's motion, in one place: short and quiet, and off when the system asks for reduced
motion (reanimated reads the setting for every animation built here).
*/

/** A row arriving in a list (a new task, a logged block). */
export const ROW_ENTER = FadeIn.duration(180).reduceMotion(ReduceMotion.System);

/** A row leaving (checked off, moved). */
export const ROW_EXIT = FadeOut.duration(140).reduceMotion(ReduceMotion.System);

/** The rows below sliding into the freed or taken place. */
export const ROW_LAYOUT = LinearTransition.duration(200).reduceMotion(ReduceMotion.System);
