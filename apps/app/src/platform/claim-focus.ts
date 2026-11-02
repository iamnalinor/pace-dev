import type { View } from "react-native";

import { moveFocus } from "./move-focus.ts";

const NOTHING_TO_STOP = (): void => undefined;

/**
Puts focus on a control as the view it sits in opens (the web build swaps in
`claim-focus.web.ts`, which waits for a modal still showing its content); a phone moves it once.
Returns how to stop trying.
*/
export const claimFocus = (target: () => null | View): (() => void) => {
  moveFocus(target());
  return NOTHING_TO_STOP;
};
