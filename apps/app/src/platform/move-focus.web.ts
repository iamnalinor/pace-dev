import type { View } from "react-native";

/**
Moves keyboard (and screen reader) focus to `target` when a control that held it goes away, so
it does not fall back to the page (bug class 5). The question is said by the group the target
sits in, named by it, and by its live region; the target is a DOM node here.
*/
export const moveFocus = (target: null | View): void => {
  (target as unknown as HTMLElement | null)?.focus();
};

/**
Whether keyboard focus is nowhere: on the page itself (`body`) or on nothing, where a disabled or
removed control leaves it. Focus on any other element is the person's own doing and stays.
*/
export const isFocusLost = (): boolean =>
  document.activeElement === null || document.activeElement === document.body;
