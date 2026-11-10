import type { View } from "react-native";

import { moveFocus } from "./move-focus.ts";

const NOTHING_TO_STOP = (): void => undefined;

/** `preventScroll`: the view around scrolls itself (an overlay revealing it); the web only. */
export type ClaimOptions = { readonly preventScroll?: boolean };

/**
Puts focus on a control as the view it sits in opens (the web build swaps in
`claim-focus.web.ts`, which waits for a modal still showing its content); a phone moves it once.
Returns how to stop trying.
*/
export const claimFocus = (
  target: () => null | View,
  _options: ClaimOptions = {},
): (() => void) => {
  moveFocus(target());
  return NOTHING_TO_STOP;
};
