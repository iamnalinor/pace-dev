import {
  DIALOG_SCALE,
  grownScale,
  overlayTiming,
  placePopover,
  POPOVER_SCALE,
  shouldDismiss,
} from "./overlay-motion.ts";

describe("overlay motion (spec §6 sheet, dialog, popover)", () => {
  it("times the sheet 280 in / 200 out, the dialog 220 / 160, the popover 160 / 110; reduced fades 160", () => {
    expect(overlayTiming("sheet", false)).toEqual({ enter: 280, exit: 200 });
    expect(overlayTiming("dialog", false)).toEqual({ enter: 220, exit: 160 });
    expect(overlayTiming("popover", false)).toEqual({ enter: 160, exit: 110 });
    for (const kind of ["sheet", "dialog", "popover"] as const) {
      expect(overlayTiming(kind, true)).toEqual({ enter: 160, exit: 160 });
    }
  });

  it("never grows a dialog or a popover from nothing (F-MOT-06)", () => {
    expect(DIALOG_SCALE).toEqual({ enter: 0.96, exit: 0.98 });
    expect(POPOVER_SCALE).toBeCloseTo(0.98, 5);
  });

  it("keeps the scale between its start and 1 even when a frame lands just outside the run (F-MOT-06)", () => {
    // The web's first frame can come a few ms before the animation's start: an ease-out curve
    // then answers a step below 0, which drew the dialog at 94 %.
    expect(grownScale(DIALOG_SCALE.enter, -0.4)).toBeCloseTo(0.96, 5);
    expect(grownScale(DIALOG_SCALE.enter, 0)).toBeCloseTo(0.96, 5);
    expect(grownScale(DIALOG_SCALE.enter, 0.5)).toBeCloseTo(0.98, 5);
    expect(grownScale(DIALOG_SCALE.enter, 1)).toBeCloseTo(1, 5);
    expect(grownScale(POPOVER_SCALE, 1.2)).toBeCloseTo(1, 5);
  });

  it("dismisses a dragged sheet past 30 % of its height or at 800 dp/s, never on a drag up", () => {
    expect(shouldDismiss({ height: 400, translation: 121, velocity: 0 })).toBe(true);
    expect(shouldDismiss({ height: 400, translation: 119, velocity: 0 })).toBe(false);
    expect(shouldDismiss({ height: 400, translation: 20, velocity: 800 })).toBe(true);
    expect(shouldDismiss({ height: 400, translation: 20, velocity: 799 })).toBe(false);
    expect(shouldDismiss({ height: 400, translation: -200, velocity: -2000 })).toBe(false);
  });

  it("places a popover under its anchor, above it when there is no room, inside the window", () => {
    const window = { height: 900, width: 1440 };
    const under = placePopover({
      anchor: { height: 44, width: 120, x: 600, y: 100 },
      size: { height: 300, width: 360 },
      window,
    });
    expect(under).toEqual({ left: 600, side: "below", top: 152 });
    // A trigger at the bottom edge (the time bar): it opens above.
    const above = placePopover({
      anchor: { height: 44, width: 120, x: 600, y: 820 },
      size: { height: 300, width: 360 },
      window,
    });
    expect(above).toEqual({ left: 600, side: "above", top: 512 });
    // A trigger at the trailing edge: the popover stays inside the window's gutter.
    const edge = placePopover({
      anchor: { height: 44, width: 60, x: 1400, y: 100 },
      size: { height: 300, width: 360 },
      window,
    });
    expect(edge.left).toBe(1440 - 8 - 360);
  });
});
