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

  it("measures at most MAX_CONTROLS controls, however many the page has", () => {
    const many = Array.from({ length: MAX_CONTROLS * 3 }, (_, index) => {
      const node = control(160, 100);
      return { ...node, getBoundingClientRect: jest.fn(node.getBoundingClientRect), index };
    });
    controlsNear(ANCHOR, { now: 0, reuseMs: 600, root: rootOf(many) });
    const measured = many.filter((node) => node.getBoundingClientRect.mock.calls.length > 0);
    expect(measured).toHaveLength(MAX_CONTROLS);
  });
});
