import { placeTooltip } from "./tooltip-place.ts";

const VIEWPORT = { height: 800, width: 1280 };
const BUBBLE = { height: 26, width: 120 };

describe("placeTooltip", () => {
  it("centres the bubble over its trigger", () => {
    expect(
      placeTooltip({ height: 40, width: 40, x: 500, y: 600 }, BUBBLE, { viewport: VIEWPORT }),
    ).toEqual({
      left: 460,
      side: "above",
      // 4 px of air (space.2): 6 laid the sidebar bell's bubble over New task (overlays e2e).
      top: 570,
    });
  });

  it("flips under the trigger when there is no room above", () => {
    expect(
      placeTooltip({ height: 40, width: 40, x: 500, y: 10 }, BUBBLE, { viewport: VIEWPORT }),
    ).toEqual({
      left: 460,
      side: "below",
      top: 54,
    });
  });

  it("stays inside the window at either edge", () => {
    expect(
      placeTooltip({ height: 40, width: 40, x: 0, y: 600 }, BUBBLE, { viewport: VIEWPORT }).left,
    ).toBe(8);
    expect(
      placeTooltip({ height: 40, width: 40, x: 1260, y: 600 }, BUBBLE, { viewport: VIEWPORT }).left,
    ).toBe(1152);
  });

  it("goes below when above would lie over another control", () => {
    const anchor = { height: 40, width: 40, x: 500, y: 600 };
    const field = { height: 40, width: 400, x: 300, y: 560 };
    expect(placeTooltip(anchor, BUBBLE, { others: [field], viewport: VIEWPORT }).side).toBe(
      "below",
    );
  });

  it("goes beside the trigger when neither above nor below is clear (the sidebar's bell over New task)", () => {
    const bell = { height: 44, width: 44, x: 179, y: 16 };
    const newTask = { height: 44, width: 223, x: 12, y: 64 };
    const place = placeTooltip(bell, BUBBLE, { others: [newTask], viewport: VIEWPORT });
    expect(place.side).toBe("after");
    expect(place.left).toBe(179 + 44 + 4);
    const box = { height: BUBBLE.height, width: BUBBLE.width, x: place.left, y: place.top };
    expect(box.y + box.height <= newTask.y || box.x >= newTask.x + newTask.width).toBe(true);
  });

  it("keeps the first side when every side covers something", () => {
    const anchor = { height: 40, width: 40, x: 500, y: 600 };
    const wall = { height: 800, width: 1280, x: 0, y: 0 };
    expect(placeTooltip(anchor, BUBBLE, { others: [wall], viewport: VIEWPORT }).side).toBe("above");
  });
});
