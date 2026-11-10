import type { ScrollView, View } from "react-native";

import { createContext, use, useEffect, useRef } from "react";

/** Room left between a revealed message and the body's edge (the pinned footer's hairline). */
const MARGIN = 16;

/** Where the overlay's body is scrolled to and how much of it shows. */
export type Viewport = { offset: number; height: number };

/** A box on the web page, as `getBoundingClientRect` gives it. */
type Box = { readonly top: number; readonly bottom: number };

/** What a message hands in to be revealed: a native view, or the element it is on the web. */
type Revealed = Pick<View, "measureLayout"> & {
  readonly getBoundingClientRect?: () => Box;
};

/** The scroll view's parts reveal needs: its content, its scroll and, on the web, its element. */
type Scroller = Pick<ScrollView, "getInnerViewNode" | "getScrollableNode" | "scrollTo">;

/** How far to scroll so a box shows whole, with room, inside a frame: + down, - up, 0 not at all. */
const shortfall = (box: Box, frame: Box): number => {
  const below = box.bottom + MARGIN - frame.bottom;
  if (below > 0) {
    return below;
  }
  const above = frame.top - (box.top - MARGIN);
  return above > 0 ? -above : 0;
};

/**
Scrolls the overlay's body so `node` shows whole, with room, above its bottom edge (where a pinned
footer starts) and below its top: on the web from the element's box against the body's, on a
phone from its place measured in the body's content. Nothing moves when it shows already.
*/
export const revealIn = (scroll: null | Scroller, node: null | Revealed, viewport: Viewport) => {
  if (scroll === null || node === null) {
    return;
  }
  const scrollBy = (by: number): void => {
    if (by !== 0) {
      scroll.scrollTo({ animated: true, y: Math.max(0, viewport.offset + by) });
    }
  };
  const frame = scroll.getScrollableNode() as unknown;
  if (typeof node.getBoundingClientRect === "function" && hasBox(frame)) {
    scrollBy(shortfall(node.getBoundingClientRect(), frame.getBoundingClientRect()));
    return;
  }
  node.measureLayout(
    scroll.getInnerViewNode() as number,
    // The content's x, y, width, height: only y and the height matter.
    (...[, top = 0, , height = 0]: readonly number[]) => {
      scrollBy(
        shortfall(
          { bottom: top + height, top },
          { bottom: viewport.offset + viewport.height, top: viewport.offset },
        ),
      );
    },
    () => undefined,
  );
};

const hasBox = (frame: unknown): frame is { readonly getBoundingClientRect: () => Box } =>
  typeof frame === "object" &&
  frame !== null &&
  typeof (frame as { getBoundingClientRect?: unknown }).getBoundingClientRect === "function";

/** The enclosing overlay body's reveal; `null` outside an overlay (a page scrolls on its own). */
export const RevealContext = createContext<((node: null | Revealed) => void) | null>(null);

/**
A ref for a message that must be seen when it appears (a field's error, a form's alert): inside a
sheet or a dialog its body scrolls it into view, so an error under the last field never sits
below the fold behind the pinned Save (QA round 26 R26-01). It runs when the message appears and
when its text changes.
*/
export const useRevealOnShow = <Node extends Revealed = View>(text: string) => {
  const reveal = use(RevealContext);
  const ref = useRef<Node>(null);
  useEffect(() => {
    reveal?.(ref.current);
  }, [reveal, text]);
  return ref;
};
