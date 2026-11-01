import { AccessibilityInfo, findNodeHandle, type View } from "react-native";

/**
Moves the screen reader to `target` when a control that held it goes away (an inline confirm
replacing its button, Cancel giving the button back), saying `say` first: TalkBack reads only
the control it lands on, not the question beside it (bug class 5).
*/
export const moveFocus = (target: null | View, say?: string): void => {
  if (say !== undefined) {
    AccessibilityInfo.announceForAccessibility(say);
  }
  const node = target === null ? null : findNodeHandle(target);
  if (node !== null) {
    AccessibilityInfo.setAccessibilityFocus(node);
  }
};

/**
Whether focus is nowhere: a control that held it was disabled or removed and the page took it.
A phone has no such place (the screen reader's focus is not ours to read), so it counts as lost:
the control that held it asks for it back.
*/
export const isFocusLost = (): boolean => true;
