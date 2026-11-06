import type { LayoutChangeEvent } from "react-native";

import { useState } from "react";

/**
One width for a chart's values (F-LAY-14): every value reports its own, the column takes the
widest, so every bar ends on the same x and the values line up on the right.
*/
export const useValueColumn = () => {
  const [width, setWidth] = useState(0);
  return {
    onLayout: (event: LayoutChangeEvent): void => {
      const own = Math.ceil(event.nativeEvent.layout.width);
      if (own > width) {
        setWidth(own);
      }
    },
    style: { minWidth: width },
  };
};
