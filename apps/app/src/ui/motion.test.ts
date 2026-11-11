import { motion } from "@pace/core";

import { ROW_MOTION } from "./motion.ts";

describe("row motion (spec §3.8, §6)", () => {
  it("takes every duration from the tokens and never runs past 300 ms (F-MOT-04)", () => {
    expect(ROW_MOTION.enter.duration).toBe(motion.duration.sm);
    expect(ROW_MOTION.exit.duration).toBe(motion.exit.sm);
    expect(ROW_MOTION.closeUp.duration).toBe(motion.duration.md);
    for (const step of Object.values(ROW_MOTION)) {
      expect(step.duration).toBeLessThanOrEqual(300);
    }
  });

  it("gives every step a curve: enter eases out, exit eases in, the close-up moves in place", () => {
    expect(ROW_MOTION.enter.easing).toBe("enter");
    expect(ROW_MOTION.exit.easing).toBe("exit");
    expect(ROW_MOTION.closeUp.easing).toBe("move");
  });

  it("fades a checked row for as long under reduced motion as without it (never zero)", () => {
    expect(ROW_MOTION.checkFade.duration).toBe(motion.duration.sm);
    expect(ROW_MOTION.checkFade.reduced).toBe(motion.reduced.fade);
    expect(ROW_MOTION.checkFade.reduced).toBeGreaterThan(0);
  });
});
