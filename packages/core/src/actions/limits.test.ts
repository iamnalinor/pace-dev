import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { fitText } from "./limits.ts";

describe("fitText (a text cut to a stored field's length)", () => {
  it("never splits a character and keeps within the field's length", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "grapheme", maxLength: 60 }),
        fc.integer({ max: 40, min: 2 }),
        (text, max) => {
          const fitted = fitText(text, max);
          expect(fitted.isWellFormed()).toBe(true);
          expect(fitted.length).toBeLessThanOrEqual(max);
          expect(text.startsWith(fitted.replace(/…$/u, "").trimEnd()) || fitted === text).toBe(
            true,
          );
        },
      ),
    );
  });

  it("cuts before an emoji the limit falls inside", () => {
    expect(fitText(`ab${"😀".repeat(3)}`, 4)).toBe("ab…");
  });
});
