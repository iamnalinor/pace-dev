import type { Box } from "./tooltip-place.ts";

/** The controls a bubble must not lie over (bug class 6: an overlay over a control takes its press). */
const CONTROLS =
  'button, input, textarea, select, a[href], [role="button"], [role="link"], [role="tab"], [role="switch"], [role="radio"], [role="checkbox"]';

/** How far from its trigger a control can be and still be in a bubble's way. */
const NEAR_PX = 320;

/**
At most this many controls near the trigger are kept for the bubble to avoid, the nearest first
(a Week of blocks has hundreds). The cap comes after the nearness filter: capped in DOM order, a
trigger late in the page lost its neighbours and the bubble covered them (bug class 6).
*/
export const MAX_CONTROLS = 120;

/** The part of the DOM a scan reads (a duck type, so it is testable without a browser). */
export type ControlNode = {
  readonly getBoundingClientRect: () => {
    readonly height: number;
    readonly left: number;
    readonly top: number;
    readonly width: number;
  };
  readonly closest: (selector: string) => unknown;
};

export type ScanRoot = { readonly querySelectorAll: (selector: string) => Iterable<ControlNode> };

/**
The last scan's boxes and when it was read: a warm hover (moving along a row of triggers) reuses
them instead of measuring the page again; a scroll or a resize (which also take any tooltip away)
forgets them.
*/
const cache: { at: number; boxes: readonly Box[]; root: null | ScanRoot } = {
  at: 0,
  boxes: [],
  root: null,
};

/** Forgets the last scan: the page moved under it. */
export const forgetControls = (): void => {
  cache.root = null;
  cache.boxes = [];
};

const boxOf = (node: ControlNode): Box => {
  const rect = node.getBoundingClientRect();
  return { height: rect.height, width: rect.width, x: rect.left, y: rect.top };
};

const isInside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

const isNear = (box: Box, anchor: Box): boolean =>
  box.width > 0 &&
  Math.abs(box.x + box.width / 2 - (anchor.x + anchor.width / 2)) < NEAR_PX + box.width / 2 &&
  Math.abs(box.y + box.height / 2 - (anchor.y + anchor.height / 2)) < NEAR_PX;

/**
The visible controls' boxes in `root`: one layout, then a read per control (nothing is written in
between), reused by warm hovers.
*/
const measure = (root: ScanRoot): readonly Box[] => {
  const boxes: Box[] = [];
  for (const control of root.querySelectorAll(CONTROLS)) {
    if (control.closest('[aria-hidden="true"]') === null) {
      boxes.push(boxOf(control));
    }
  }
  return boxes;
};

const centreDistance = (box: Box, anchor: Box): number =>
  Math.hypot(
    box.x + box.width / 2 - (anchor.x + anchor.width / 2),
    box.y + box.height / 2 - (anchor.y + anchor.height / 2),
  );

/**
The boxes of the controls near `anchor` (the trigger's own controls left out), read in `root` (the
trigger's dialog, else the page). A scan of the same root within `reuseMs` is reused, so warm
hovers do not measure the page again; at most `MAX_CONTROLS` of them are kept, the nearest.
*/
export const controlsNear = (
  anchor: Box,
  {
    now,
    reuseMs,
    root,
  }: { readonly now: number; readonly reuseMs: number; readonly root: ScanRoot },
): readonly Box[] => {
  if (cache.root !== root || now - cache.at > reuseMs) {
    cache.boxes = measure(root);
    cache.root = root;
  }
  cache.at = now;
  const near = cache.boxes.filter((box) => !isInside(box, anchor) && isNear(box, anchor));
  return near.length <= MAX_CONTROLS
    ? near
    : near
        .toSorted((a, b) => centreDistance(a, anchor) - centreDistance(b, anchor))
        .slice(0, MAX_CONTROLS);
};
