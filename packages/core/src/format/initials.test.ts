import * as fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import { capitalize, clipText, initials, splitGraphemes } from "./initials.ts";

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

describe("initials", () => {
  it("takes the first letter of the first two words, upper-cased", () => {
    expect(initials("Albert Nalinor")).toBe("AN");
    expect(initials("albert nalinor third")).toBe("AN");
    expect(initials("Альберт Налинор")).toBe("АН");
    expect(initials("  Albert  ")).toBe("A");
  });

  it("returns an emoji-first name's emoji whole, and nothing else", () => {
    expect(initials(`${FOX} Альберт`)).toBe(FOX);
    expect(initials(`${FOX}Лиса`)).toBe(FOX);
  });

  it("keeps a multi-code-point emoji together", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    const flag = "\u{1F1F7}\u{1F1FA}";
    const thumb = "\u{1F44D}\u{1F3FD}";
    expect(initials(`${family} Ivanov`)).toBe(family);
    expect(initials(`${flag} Russia`)).toBe(flag);
    expect(initials(`${thumb} ok`)).toBe(thumb);
  });

  it("keeps a letter with its combining marks", () => {
    expect(initials("émile zola")).toBe("ÉZ");
  });

  it("splits on spaces only: a hyphenated name is one word", () => {
    expect(initials("Анна-Мария Иванова")).toBe("АИ");
  });

  it("skips words that do not start with a letter", () => {
    expect(initials("(admin) Albert")).toBe("A");
    expect(initials("42")).toBe("");
  });

  it("is empty when there is nothing to show", () => {
    expect(initials("")).toBe("");
    expect(initials(" ".repeat(3))).toBe("");
    expect(initials("---")).toBe("");
  });

  it("never returns a lone surrogate, whatever the name is", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (name) => {
        expect(isWellFormed(initials(name))).toBe(true);
      }),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), (name) => {
        expect(isWellFormed(initials(name))).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("returns at most two graphemes", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), (name) => {
        expect(splitGraphemes(initials(name)).length).toBeLessThanOrEqual(2);
      }),
      { numRuns: 500 },
    );
  });
});

describe("splitGraphemes", () => {
  it("falls back to code-point clusters when Intl.Segmenter is missing", () => {
    const segmenter = Intl.Segmenter;
    Object.defineProperty(Intl, "Segmenter", { configurable: true, value: undefined });
    try {
      expect(splitGraphemes(`a${FOX}\u{1F44D}\u{1F3FD}é`)).toEqual([
        "a",
        FOX,
        "\u{1F44D}\u{1F3FD}",
        "é",
      ]);
      expect(initials(`${FOX} Альберт`)).toBe(FOX);
      expect(initials("Albert Nalinor")).toBe("AN");
    } finally {
      Object.defineProperty(Intl, "Segmenter", { configurable: true, value: segmenter });
    }
  });
});

describe("capitalize", () => {
  it("upper-cases the first letter by the language's rules", () => {
    expect(capitalize("октябрь", "ru")).toBe("Октябрь");
    expect(capitalize("istanbul", "tr")).toBe("İstanbul");
    expect(capitalize("", "en")).toBe("");
  });

  it("cuts by grapheme: a leading emoji or accented letter stays whole", () => {
    expect(capitalize("\u{1F98A} fox", "en")).toBe("\u{1F98A} fox");
    expect(capitalize("e\u{301}cole", "fr")).toBe("E\u{301}cole");
  });
});

describe("initials after upper-casing", () => {
  it("keeps one grapheme per initial: ß upper-cases to SS and shows S", () => {
    expect(initials("\u{DF} a")).toBe("SA");
    expect(initials("a \u{DF}")).toBe("AS");
  });

  it("maps case by the language when one is given", () => {
    expect(initials("istanbul izmir", "ru")).toBe("II");
    expect(initials("\u{131}stanbul", "en")).toBe("I");
  });

  it("stays within two graphemes for names full of ß and ligatures", () => {
    const odd = fc.constantFrom("\u{DF}", "\u{1C6}", "\u{149}", "\u{FB03}", " ", "a", "\u{1F98A}");
    fc.assert(
      fc.property(fc.array(odd, { maxLength: 12 }), (parts) => {
        const result = initials(parts.join(""));
        expect(splitGraphemes(result).length).toBeLessThanOrEqual(2);
        expect(isWellFormed(result)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe("without regular-expression property escapes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** An engine that rejects \p{...}: building such a pattern throws. */
  const rejected = vi.fn();
  const rejectProperties = () => {
    rejected.mockClear();
    vi.stubGlobal(
      "RegExp",
      new Proxy(RegExp, {
        construct: (target, args: [string, string?]) => {
          if (args[0].includes(String.raw`\p{`)) {
            rejected();
            throw new SyntaxError("Invalid property name");
          }
          return Reflect.construct(target, args);
        },
      }),
    );
  };

  /**
  Loading all of @pace/core afresh (every module, zod schemas included) is the point of the next
  test: a `\p{…}` pattern built at module scope anywhere in core would take the import down. On a
  loaded machine that import alone can outlast vitest's default 5 s, so it gets more time.
  */
  const WHOLE_CORE_IMPORT_MS = 30_000;

  it("still loads @pace/core and returns whole characters", {
    timeout: WHOLE_CORE_IMPORT_MS,
  }, async () => {
    rejectProperties();
    vi.resetModules();
    const core = await import("../core.ts");
    expect(core.initials("Albert Nalinor")).toBe("AN");
    expect(core.initials(`${FOX} \u{410}\u{43B}\u{44C}\u{431}\u{435}\u{440}\u{442}`)).toBe(FOX);
    expect(core.initials("\u{D83E} broken")).toBe("B");
    expect(core.initials("123")).toBe("");
    // The patterns are built on first use, so the engine's refusal was really met.
    expect(rejected).toHaveBeenCalled();
  });

  it("splits by code point and never leaves half an emoji", async () => {
    rejectProperties();
    vi.resetModules();
    const { initials: fresh, splitGraphemes: split } = await import("./initials.ts");
    expect(split(`a${FOX}`)).toEqual(["a", FOX]);
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (name) => {
        expect(isWellFormed(fresh(name))).toBe(true);
      }),
      { numRuns: 200 },
    );
    expect(rejected).toHaveBeenCalled();
  });
});

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
