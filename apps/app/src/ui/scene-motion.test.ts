import { sceneMotion } from "./scene-motion.ts";

describe("sceneMotion (spec §6 route push / pop on the web)", () => {
  it("never moves a tab's screen: a tab switch has no transition", () => {
    for (const hasLeft of [false, true]) {
      for (const wasThereAtStart of [false, true]) {
        expect(sceneMotion({ hasLeft, isPushed: false, wasThereAtStart })).toBe("none");
      }
    }
  });

  it("leaves the screens of a cold link alone: what is there at first is simply there (F-MOT-07)", () => {
    expect(sceneMotion({ hasLeft: false, isPushed: true, wasThereAtStart: true })).toBe("none");
  });

  it("slides a pushed screen in, and brings the screen under a popped one back", () => {
    expect(sceneMotion({ hasLeft: false, isPushed: true, wasThereAtStart: false })).toBe("in");
    expect(sceneMotion({ hasLeft: true, isPushed: true, wasThereAtStart: false })).toBe("back");
    expect(sceneMotion({ hasLeft: true, isPushed: true, wasThereAtStart: true })).toBe("back");
  });
});
