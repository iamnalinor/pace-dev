import {
  type ControlNode,
  controlsNear,
  forgetControls,
  MAX_CONTROLS,
} from "./tooltip-controls.ts";

const control = (x: number, y: number, isHidden = false): ControlNode => ({
  closest: (selector) => (isHidden && selector.includes("aria-hidden") ? {} : null),
  getBoundingClientRect: () => ({ height: 44, left: x, top: y, width: 44 }),
});

const rootOf = (controls: readonly ControlNode[]) => {
  const querySelectorAll = jest.fn(() => controls);
  return { querySelectorAll };
};

const ANCHOR = { height: 44, width: 44, x: 100, y: 100 };

beforeEach(() => {
  forgetControls();
});

describe("controlsNear (UI review I3: bounded per show)", () => {
  it("keeps the near, visible controls other than the trigger's own", () => {
    const root = rootOf([
      control(100, 100),
      control(160, 100),
      control(2000, 100),
      control(160, 160, true),
    ]);
    expect(controlsNear(ANCHOR, { now: 0, reuseMs: 600, root })).toEqual([
      { height: 44, width: 44, x: 160, y: 100 },
    ]);
  });

  it("reuses the last scan for a warm hover: the page is not measured again", () => {
    const root = rootOf([control(160, 100)]);
    controlsNear(ANCHOR, { now: 0, reuseMs: 600, root });
    controlsNear({ ...ANCHOR, x: 160 }, { now: 300, reuseMs: 600, root });
    controlsNear(ANCHOR, { now: 800, reuseMs: 600, root });
    expect(root.querySelectorAll).toHaveBeenCalledTimes(1);
    controlsNear(ANCHOR, { now: 2000, reuseMs: 600, root });
    expect(root.querySelectorAll).toHaveBeenCalledTimes(2);
  });

  it("measures again after the page moved (a scroll forgets the scan) or in another root", () => {
    const root = rootOf([control(160, 100)]);
    controlsNear(ANCHOR, { now: 0, reuseMs: 600, root });
    forgetControls();
    controlsNear(ANCHOR, { now: 10, reuseMs: 600, root });
    const dialog = rootOf([]);
    controlsNear(ANCHOR, { now: 20, reuseMs: 600, root: dialog });
    expect(root.querySelectorAll).toHaveBeenCalledTimes(2);
    expect(dialog.querySelectorAll).toHaveBeenCalledTimes(1);
  });

  it("keeps at most MAX_CONTROLS controls, the nearest, however many the page has", () => {
    const many = Array.from({ length: MAX_CONTROLS * 3 }, (_, index) =>
      control(160 + (index % 2) * 60, 100),
    );
    const near = controlsNear(ANCHOR, { now: 0, reuseMs: 600, root: rootOf(many) });
    expect(near).toHaveLength(MAX_CONTROLS);
    expect(near.every((box) => box.x === 160)).toBe(true);
  });

  it("finds the trigger's neighbour late in a long page (a Week of blocks: bug class 6)", () => {
    // Hundreds of blocks elsewhere on the page come first in the DOM; the neighbour is after them.
    const far = Array.from({ length: MAX_CONTROLS * 2 }, () => control(2000, 2000));
    const root = rootOf([...far, control(100, 100), control(100, 150)]);
    expect(controlsNear(ANCHOR, { now: 0, reuseMs: 600, root })).toEqual([
      { height: 44, width: 44, x: 100, y: 150 },
    ]);
  });
});
