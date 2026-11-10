import type { RefObject } from "react";
import type { View } from "react-native";

const NOTHING_TO_STOP = (): void => undefined;

/**
A phone's screen reader is not left on nothing when a control goes away, so a toast takes no focus
there (the web build swaps in `toast-focus.web.ts`). Returns how to stop watching.
*/
export const focusUndoIfLost = (_place: RefObject<null | View>): (() => void) => NOTHING_TO_STOP;
