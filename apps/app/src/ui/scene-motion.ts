/** How a navigator's screen comes to the front on the web (spec §6 "route push / pop"). */
export type SceneMotion = "back" | "in" | "none";

/**
Which motion a stack's screen plays the next time it comes to the front. A screen that was there
when the app opened (a cold link opens the tabs and the task at once) simply is there; a screen
pushed later slides in 12 px and fades; a screen that has been in front, left and is shown again
(the one under a popped screen) comes back from the other side. Tabs take no part: a tab switch has
no transition.
*/
export const sceneMotion = ({
  hasLeft,
  isPushed,
  wasThereAtStart,
}: {
  /** It has lost the front at least once. */
  readonly hasLeft: boolean;
  /** A stack's screen; a tab's screen is not. */
  readonly isPushed: boolean;
  readonly wasThereAtStart: boolean;
}): SceneMotion => {
  if (!isPushed) {
    return "none";
  }
  if (hasLeft) {
    return "back";
  }
  return wasThereAtStart ? "none" : "in";
};
