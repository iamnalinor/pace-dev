import { wheelTarget } from "./wheel-scroll.ts";

describe("wheelTarget (a row of chips follows the wheel, F-DAT-02)", () => {
  it("turns a vertical wheel into a sideways move", () => {
    expect(wheelTarget({ deltaX: 0, deltaY: 100, left: 0, max: 400 })).toBe(100);
    expect(wheelTarget({ deltaX: 0, deltaY: -40, left: 100, max: 400 })).toBe(60);
  });

  it("stops at the ends, and hands the wheel back to the page there", () => {
    expect(wheelTarget({ deltaX: 0, deltaY: 500, left: 300, max: 400 })).toBe(400);
    expect(wheelTarget({ deltaX: 0, deltaY: 50, left: 400, max: 400 })).toBeNull();
    expect(wheelTarget({ deltaX: 0, deltaY: -50, left: 0, max: 400 })).toBeNull();
  });

  it("leaves a sideways turn and a row with nothing to scroll alone", () => {
    expect(wheelTarget({ deltaX: 80, deltaY: 10, left: 0, max: 400 })).toBeNull();
    expect(wheelTarget({ deltaX: 0, deltaY: 100, left: 0, max: 0 })).toBeNull();
  });
});
