import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { clipText, clipWords } from "./cut-text.ts";
import { splitGraphemes } from "./graphemes.ts";

const FOX = "\u{1F98A}";

/** True when no UTF-16 surrogate is left unpaired. */
const isWellFormed = (text: string): boolean => {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.codePointAt(index) ?? 0;
    if (unit >= 0x1_00_00) {
      index += 1;
    } else if (unit >= 0xd8_00 && unit <= 0xdf_ff) {
      return false;
    }
  }
  return true;
};

describe("clipText", () => {
  it("keeps a text that fits, and ends a longer one with an ellipsis inside the limit", () => {
    expect(clipText("Buy milk", 8)).toBe("Buy milk");
    expect(clipText("Buy milk tomorrow", 8)).toBe("Buy mil…");
    expect(splitGraphemes(clipText("Домашка по алгебре номер шесть", 10))).toHaveLength(10);
  });

  it("drops the space before the ellipsis, and keeps at least the ellipsis for a limit below one", () => {
    expect(clipText("Buy milk tomorrow", 5)).toBe("Buy…");
    expect(clipText("Buy milk", 1)).toBe("…");
    expect(clipText("Buy milk", 0)).toBe("…");
    expect(clipText("", 0)).toBe("");
  });

  it("never cuts an emoji or a letter from its marks", () => {
    const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
    expect(clipText(`${FOX}${family}${FOX}`, 2)).toBe(`${FOX}…`);
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), fc.integer({ max: 40, min: 1 }), (text, max) => {
        const clipped = clipText(text, max);
        return (
          isWellFormed(clipped) && splitGraphemes(clipped).length <= max && !/\s…$/u.test(clipped)
        );
      }),
    );
  });
});

describe("clipWords", () => {
  it("cuts a sentence at a word boundary, never inside a word", () => {
    expect(clipWords("The assistant will create the quarterly report", 30)).toBe(
      "The assistant will create the…",
    );
    expect(clipWords("The assistant will create", 40)).toBe("The assistant will create");
    // One word longer than the limit is cut inside it: there is no boundary to keep.
    expect(clipWords("Междисциплинарная", 8)).toBe("Междисц…");
  });

  it("stays within the limit and leaves no space before the ellipsis", () => {
    expect(clipWords("a b", 1)).toBe("…");
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), fc.integer({ max: 40, min: 1 }), (text, max) => {
        const clipped = clipWords(text, max);
        return splitGraphemes(clipped).length <= max && !/\s…$/u.test(clipped);
      }),
    );
  });
});
