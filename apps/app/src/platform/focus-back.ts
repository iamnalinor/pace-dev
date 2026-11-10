import type { RefObject } from "react";
import type { View } from "react-native";

/** A phone's modal hands the screen reader back itself: nothing to do (the web's is `.web.ts`). */
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the same hook as the web build's, which does call hooks
export const useFocusBack = (_anchor: RefObject<null | View>, _isMounted: boolean): void =>
  undefined;
