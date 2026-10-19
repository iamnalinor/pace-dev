import type { View } from "react-native";

import { type RefObject, useEffect } from "react";

/** The chip and its calendar form one region; a pointer anywhere else dismisses it. */
export const useOutsidePress = (
  ref: RefObject<null | View>,
  isOpen: boolean,
  onOutside: () => void,
): void => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const element = ref.current as unknown as Element | null;
      if (element !== null && !element.contains(event.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [isOpen, onOutside, ref]);
};
