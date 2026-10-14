import type { TextInput } from "react-native";

/**
Puts the cursor in the field without scrolling. A plain focus makes the browser scroll every
clipping ancestor to reveal the field; the composer's form mounts inside a box that is still at
the line's height while it grows, so the card's content would slide up out of it and back. The
field is a DOM node here.
*/
export const focusField = (input: null | TextInput): void => {
  (input as unknown as HTMLElement | null)?.focus({ preventScroll: true });
};
