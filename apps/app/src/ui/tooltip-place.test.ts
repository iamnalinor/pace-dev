import { placeTooltip } from "./tooltip-place.ts";

const VIEWPORT = { height: 800, width: 1280 };
const BUBBLE = { height: 26, width: 120 };

describe("placeTooltip", () => {
  it("centres the bubble over its trigger", () => {
    expect(placeTooltip({ height: 40, width: 40, x: 500, y: 600 }, BUBBLE, VIEWPORT)).toEqual({
      left: 460,
      side: "above",
      top: 568,
    });
  });

  it("flips under the trigger when there is no room above", () => {
    expect(placeTooltip({ height: 40, width: 40, x: 500, y: 10 }, BUBBLE, VIEWPORT)).toEqual({
      left: 460,
      side: "below",
      top: 56,
    });
  });

  it("stays inside the window at either edge", () => {
    expect(placeTooltip({ height: 40, width: 40, x: 0, y: 600 }, BUBBLE, VIEWPORT).left).toBe(8);
    expect(placeTooltip({ height: 40, width: 40, x: 1260, y: 600 }, BUBBLE, VIEWPORT).left).toBe(
      1152,
    );
  });
});
