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

  it("prefers below for a trigger in the window's top 120 px, so a header's bubble never covers the title (design review 2 N4)", () => {
    // Day's ‹ at y = 64 had room above and its «Предыдущий день» lay over «День».
    expect(
      placeTooltip({ height: 44, width: 44, x: 500, y: 64 }, BUBBLE, { viewport: VIEWPORT }).side,
    ).toBe("below");
    expect(
      placeTooltip({ height: 44, width: 44, x: 500, y: 64 }, BUBBLE, {
        others: [{ height: 40, width: 200, x: 420, y: 112 }],
        viewport: VIEWPORT,
      }).side,
    ).toBe("above");
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

  it("slides the bubble along a side when centred it would cover a control (the running card's Stop beside the activity field)", () => {
    // Now at 1280: the card's Stop at the card's right edge, «Чем заняты?» 41 px to its right,
    // «Да, ещё» before it and the alongside row's Stop under it. Centred above, «Стоп: Пошёл в ЦСС»
    // lay 7 px over the field; every other side covered a button too.
    const stop = { height: 44, width: 44, x: 546, y: 780 };
    const bubble = { height: 35, width: 141 };
    const others = [
      { height: 37, width: 256, x: 631, y: 770.5 },
      { height: 35, width: 80, x: 454, y: 780 },
      { height: 44, width: 44, x: 546, y: 840 },
    ];
    const place = placeTooltip(stop, bubble, { others, viewport: { height: 900, width: 1280 } });
    expect(place.side).toBe("above");
    const box = { ...bubble, x: place.left, y: place.top };
    for (const other of others) {
      const isApart =
        box.x + box.width <= other.x + 1 ||
        other.x + other.width <= box.x + 1 ||
        box.y + box.height <= other.y + 1 ||
        other.y + other.height <= box.y + 1;
      expect(isApart).toBe(true);
    }
    // Still over its trigger: the bubble's span holds the trigger's.
    expect(box.x <= stop.x && box.x + box.width >= stop.x + stop.width).toBe(true);
  });

  it("keeps the first side when every side covers something", () => {
    const anchor = { height: 40, width: 40, x: 500, y: 600 };
    const wall = { height: 800, width: 1280, x: 0, y: 0 };
    expect(placeTooltip(anchor, BUBBLE, { others: [wall], viewport: VIEWPORT }).side).toBe("above");
  });
});
