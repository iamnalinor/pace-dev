import type { ScrollView } from "react-native";

import { type RefObject, useEffect } from "react";

import { wheelTarget } from "./wheel-scroll.ts";

/**
A horizontal `ScrollView` that follows the mouse wheel (see `wheelTarget`). The listener is not
passive, as it keeps the page from scrolling too while the row moves.
*/
export const useWheelScroll = (scrollerRef: RefObject<null | ScrollView>): void => {
  useEffect(() => {
    const node = scrollerRef.current?.getScrollableNode() as HTMLElement | null | undefined;
    if (node === null || node === undefined) {
      return;
    }
    const onWheel = (event: WheelEvent): void => {
      const next = wheelTarget({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        left: node.scrollLeft,
        max: node.scrollWidth - node.clientWidth,
      });
      if (next === null) {
        return;
      }

      event.preventDefault();
      node.scrollLeft = next;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
    };
  }, [scrollerRef]);
};
