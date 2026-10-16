import type { View } from "react-native";

import { type RefObject, useEffect } from "react";

/** Native form surfaces dismiss their open date panel from their touch handler. */
export const useOutsidePress = (
  _ref: RefObject<null | View>,
  _isOpen: boolean,
  _onOutside: () => void,
): void => {
  useEffect(() => undefined, []);
};
