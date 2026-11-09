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
  readonly side: Side;
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

type Side = "above" | "after" | "before" | "below";

/** The bubble's size and the window it must fit in. */
type Fit = { readonly bubble: Size; readonly viewport: Size };

/** Whether two boxes share more than a pixel. */
const isOverlapping = (one: Box, other: Box): boolean =>
  one.x < other.x + other.width - 1 &&
  other.x < one.x + one.width - 1 &&
  one.y < other.y + other.height - 1 &&
  other.y < one.y + one.height - 1;

/**
Where the bubble lines up with its trigger along the side: centred, or slid so that its start
(left, top) or its end (right, bottom) is the trigger's.
*/
type Align = "centre" | "end" | "start";

/**
The bubble's box on one side of its trigger, lined up by `align` and slid to stay inside the
window; null if it cannot fit.
*/
const boxOn = (
  side: Side,
  anchor: Box,
  { align, bubble, viewport }: Fit & { readonly align: Align },
): Box | null => {
  const clamp = (value: number, size: number, room: number): number =>
    Math.min(Math.max(value, EDGE), Math.max(EDGE, room - EDGE - size));
  const along = (start: number, length: number, size: number): number =>
    ({ centre: start + length / 2 - size / 2, end: start + length - size, start })[align];
  const centredX = clamp(along(anchor.x, anchor.width, bubble.width), bubble.width, viewport.width);
  const centredY = clamp(
    along(anchor.y, anchor.height, bubble.height),
    bubble.height,
    viewport.height,
  );
  const at = {
    above: { x: centredX, y: anchor.y - GAP - bubble.height },
    after: { x: anchor.x + anchor.width + GAP, y: centredY },
    before: { x: anchor.x - GAP - bubble.width, y: centredY },
    below: { x: centredX, y: anchor.y + anchor.height + GAP },
  }[side];
  const isInside =
    at.x >= EDGE &&
    at.y >= EDGE &&
    at.x + bubble.width <= viewport.width - EDGE &&
    at.y + bubble.height <= viewport.height - EDGE;
  return isInside ? { ...at, height: bubble.height, width: bubble.width } : null;
};

const SIDES: readonly Side[] = ["above", "below", "after", "before"];

/** The order for a trigger in the header band: below first, off the screen's title. */
const HEADER_SIDES: readonly Side[] = ["below", "above", "after", "before"];

/**
A trigger whose top is within this far of the window's top sits in the header band (the back
chevron, the period stepper, the header's actions): its bubble above lay over the large title
(design review 2 N4).
*/
export const HEADER_BAND_PX = 120;

/** Centred on every side first; only then slid to a side's start or end. */
const ALIGNS: readonly Align[] = ["centre", "end", "start"];

/**
Where a tooltip's bubble goes: above its trigger, else below, else beside it (after, before) — below
first for a trigger in the header band (`HEADER_BAND_PX`) — the first side that fits the window and
lies over none of `others` (the page's other controls: a bubble over a control takes its press, bug
class 6). No side clear centred, the same sides with the bubble slid to line up with the trigger's
end, then its start (bug class 195: a centred bubble wider than its trigger reached a neighbour
every side had). Every place covering something, the first centred one that fits; none fitting,
below.
*/
export const placeTooltip = (
  anchor: Box,
  bubble: Size,
  { others = [], viewport }: { readonly viewport: Size; readonly others?: readonly Box[] },
): Placement => {
  const sides = anchor.y < HEADER_BAND_PX ? HEADER_SIDES : SIDES;
  const fitting = ALIGNS.flatMap((align) =>
    sides.map((side) => ({ box: boxOn(side, anchor, { align, bubble, viewport }), side })),
  ).filter((place): place is { box: Box; side: Side } => place.box !== null);
  const chosen = fitting.find(({ box }) => others.every((other) => !isOverlapping(box, other))) ??
    fitting[0] ?? {
      box: {
        ...bubble,
        x: Math.min(Math.max(anchor.x, EDGE), Math.max(EDGE, viewport.width - EDGE - bubble.width)),
        y: anchor.y + anchor.height + GAP,
      },
      side: "below" as const,
    };
  return { left: chosen.box.x, side: chosen.side, top: chosen.box.y };
};
