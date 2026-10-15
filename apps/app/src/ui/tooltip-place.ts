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
const GAP = 6;
/** The bubble keeps this far from the window's edges. */
const EDGE = 8;

/** How long a tooltip shown by a tap stays (a touch screen has no "pointer left" to wait for). */
export const TAP_TOOLTIP_MS = 2500;

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
