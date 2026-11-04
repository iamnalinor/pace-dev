import { motion, space } from "@pace/core";

/** The three overlays of the kit (spec §4.2.21): each has its own pair of §6 timings. */
export type OverlayKind = "dialog" | "popover" | "sheet";

const TIMING: Readonly<Record<OverlayKind, { readonly enter: number; readonly exit: number }>> = {
  dialog: { enter: motion.duration.md, exit: motion.exit.md },
  popover: { enter: motion.duration.sm, exit: motion.exit.sm },
  sheet: { enter: motion.duration.lg, exit: motion.exit.lg },
};

/**
An overlay's enter and exit durations (spec §6): the sheet 280 / 200, the dialog 220 / 160, the
popover 160 / 110. Reduced motion fades every one of them in `reduced.fade`, both ways.
*/
export const overlayTiming = (
  kind: OverlayKind,
  isReduced: boolean,
): { readonly enter: number; readonly exit: number } =>
  isReduced ? { enter: motion.reduced.fade, exit: motion.reduced.fade } : TIMING[kind];

/** A dialog grows in from 96 % and leaves at 98 %: never from nothing (F-MOT-06). */
export const DIALOG_SCALE = { enter: 0.96, exit: 0.98 } as const;

/** A popover grows in from 98 % at its anchor's edge. */
export const POPOVER_SCALE = 0.98;

/** Past this share of its height, a dragged sheet goes (spec §4.2.21). */
const DISMISS_SHARE = 0.3;

/** A flick at least this fast (dp per second) dismisses whatever the distance. */
const DISMISS_VELOCITY = 800;

/** Whether a released drag dismisses the sheet: far enough, or fast enough, and downwards. */
export const shouldDismiss = ({
  height,
  translation,
  velocity,
}: {
  readonly height: number;
  readonly translation: number;
  readonly velocity: number;
}): boolean =>
  translation > 0 && (translation > height * DISMISS_SHARE || velocity >= DISMISS_VELOCITY);

type Box = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

/** The gap between a popover and its trigger, and its distance from the window's edges. */
const GAP = space["3"];

/**
Where a popover goes (spec §4.2.21): under its trigger, its leading edges lined up; above it when
the window has no room below (a trigger on the bottom edge, the time bar); always inside the
window by `space.3`.
*/
export const placePopover = ({
  anchor,
  size,
  window,
}: {
  readonly anchor: Box;
  readonly size: { readonly height: number; readonly width: number };
  readonly window: { readonly height: number; readonly width: number };
}): { readonly left: number; readonly side: "above" | "below"; readonly top: number } => {
  const below = anchor.y + anchor.height + GAP;
  const isBelow = below + size.height <= window.height - GAP || anchor.y - GAP - size.height < GAP;
  const top = isBelow ? below : anchor.y - GAP - size.height;
  const left = Math.max(GAP, Math.min(anchor.x, window.width - GAP - size.width));
  return { left, side: isBelow ? "below" : "above", top };
};
