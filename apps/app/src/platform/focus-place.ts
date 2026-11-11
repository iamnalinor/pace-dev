import type { RefObject } from "react";
import type { View } from "react-native";

import { moveFocus } from "./move-focus.ts";

/**
After an editor in place closes (its field gone), the screen reader goes to the place it stood in,
not back to the top of the screen (QA round 25 R25-09, bug class 5). The web build puts keyboard
focus on the place's control (`focus-place.web.ts`).
*/
export const focusPlace = (place: RefObject<null | View>): void => {
  moveFocus(place.current);
};

/** The web build moves keyboard focus to a row by its id (`focus-place.web.ts`); the phone has none. */
export const focusPlaceById = (_id: string): void => undefined;

/** Where the focused row of a list stood; the phone has no keyboard focus to keep, so never one. */
export type RowPlace = null | { readonly index: number };

export const focusedRowPlace = (): RowPlace => null;

export const focusRowPlace = (_place: RowPlace): void => undefined;
