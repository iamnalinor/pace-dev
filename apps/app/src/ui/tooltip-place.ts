import { space } from "@pace/core";

/** A rectangle on the screen, in the window's coordinates. */
export type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type Size = { readonly width: number; readonly height: number };

export type Placement = {
  readonly left: number;
  readonly top: number;
  readonly side: "above" | "below";
};

/** Air between the trigger and the bubble. */
const GAP = space["2"];
/** The bubble keeps this far from the window's edges. */
const EDGE = 8;

/**
How long the pointer rests on a trigger before its tooltip shows (spec §6 tooltip): a pass over
a row of buttons on the way elsewhere brings nothing up.
*/
export const HOVER_DELAY_MS = 400;

/**
How long a tooltip waits after the pointer leaves its trigger or its bubble: long enough to cross
the gap between them, so the bubble can be hovered (WCAG 1.4.13).
*/
export const HOVER_GRACE_MS = 120;

/**
Within this long of one tooltip closing, the next trigger's shows at once: moving along a row of
icon buttons reads each name without waiting again.
*/
export const WARM_MS = 600;

/**
Where a tooltip's bubble goes: centred over its trigger, or under it when there is no room
above, and slid sideways to stay inside the window.
*/
export const placeTooltip = (anchor: Box, bubble: Size, viewport: Size): Placement => {
  const above = anchor.y - GAP - bubble.height;
  const side = above >= EDGE ? "above" : "below";
  const centred = anchor.x + anchor.width / 2 - bubble.width / 2;
  const rightmost = Math.max(EDGE, viewport.width - EDGE - bubble.width);
  return {
    left: Math.min(Math.max(centred, EDGE), rightmost),
    side,
    top: side === "above" ? above : anchor.y + anchor.height + GAP,
  };
};
