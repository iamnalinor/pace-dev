import { describe, expect, it } from "vitest";

import { contrastRatio, parseHex, relativeLuminance } from "./contrast.ts";
import {
  IMPORTANCE_COLORS,
  inkOf,
  type PaletteName,
  type ProjectColorName,
  STATUS_COLORS,
  TAG_TINT,
  THEMES,
  tokens,
} from "./tokens.ts";

describe("parseHex", () => {
  it("parses 6-digit and 3-digit hex", () => {
    expect(parseHex("#0b0b0c")).toEqual({ b: 12, g: 11, r: 11 });
    expect(parseHex("#FFF")).toEqual({ b: 255, g: 255, r: 255 });
  });

  it("rejects anything else", () => {
    expect(parseHex("rgba(255,255,255,0.07)")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance({ b: 0, g: 0, r: 0 })).toBe(0);
    expect(relativeLuminance({ b: 255, g: 255, r: 255 })).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("is null for a colour it cannot parse", () => {
    expect(contrastRatio("rgba(0,0,0,0.5)", "#ffffff")).toBeNull();
  });
});

const COLORS = Object.keys(tokens.project) as ProjectColorName[];

/** `color` laid over `background` at `alpha`, as the browser composites a tinted tag. */
const wash = (color: string, background: string, alpha: number): string => {
  const top = parseHex(color);
  const bottom = parseHex(background);
  if (top === null || bottom === null) {
    return "";
  }
  const mix = (a: number, b: number): string =>
    Math.round(a * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(top.r, bottom.r)}${mix(top.g, bottom.g)}${mix(top.b, bottom.b)}`;
};

describe("tokens", () => {
  const TEXT: readonly PaletteName[] = [
    "fg",
    "fg2",
    "muted",
    "accentText",
    "accentQuietText",
    "warn",
    "question",
  ];
  const BACKGROUNDS: readonly PaletteName[] = ["bg", "surface"];

  it.each(THEMES)("%s text colours reach 4.5:1 on bg and surface", (theme) => {
    const palette = tokens[theme];
    const failures = TEXT.flatMap((text) =>
      BACKGROUNDS.map((background) => ({
        background,
        ratio: contrastRatio(palette[text], palette[background]),
        text,
      })),
    ).filter(({ ratio }) => ratio === null || ratio < 4.5);
    expect(failures).toEqual([]);
  });

  it.each(THEMES)(
    "%s outlines and the mark (ink-*, accentText, accentQuietText) reach 3:1 on bg, surface and raised",
    (theme) => {
      const palette = tokens[theme];
      const marks: readonly PaletteName[] = [
        "accentText",
        "accentQuietText",
        "faint",
        ...COLORS.map((color) => inkOf(color)),
      ];
      const failures = marks.flatMap((mark) =>
        (["bg", "surface", "raised"] as const)
          .map((background) => ({
            background,
            mark,
            ratio: contrastRatio(palette[mark], palette[background]) ?? 0,
          }))
          .filter(({ ratio }) => ratio < 3),
      );
      expect(failures).toEqual([]);
    },
  );

  it.each(THEMES)("%s accentFg reaches 4.5:1 on accent", (theme) => {
    expect(contrastRatio(tokens[theme].accentFg, tokens[theme].accent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEMES)("%s accentQuietFg reaches 4.5:1 on accentQuiet", (theme) => {
    expect(
      contrastRatio(tokens[theme].accentQuietFg, tokens[theme].accentQuiet),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEMES)(
    "%s keeps two accents: a lime for important actions, an indigo for quiet states",
    (theme) => {
      const palette = tokens[theme];
      const lime = parseHex(palette.accent);
      const indigo = parseHex(palette.accentQuiet);
      // Lime: green and red lead, blue trails. Indigo: blue leads.
      expect(lime !== null && lime.g > lime.b && lime.r > lime.b).toBe(true);
      expect(indigo !== null && indigo.b > indigo.g && indigo.b > indigo.r).toBe(true);
    },
  );

  it("fills the dark theme's actions with the brand lime", () => {
    expect(tokens.dark.accent).toBe("#d4ff3a");
    expect(tokens.dark.accentText).toBe("#d4ff3a");
  });

  it.each(THEMES)(
    "%s colored tags reach 4.5:1: ink on its wash, dark text on the solid color",
    (theme) => {
      const palette = tokens[theme];
      const failures = COLORS.flatMap((color) =>
        (["surface", "raised"] as const).map((background) => {
          const tinted = wash(tokens.project[color], palette[background], TAG_TINT);
          const ink = contrastRatio(palette[inkOf(color)], tinted) ?? 0;
          const solid = contrastRatio(palette.onColor, tokens.project[color]) ?? 0;
          return { background, color, ink, solid };
        }),
      ).filter(({ ink, solid }) => ink < 4.5 || solid < 4.5);
      expect(failures).toEqual([]);
    },
  );

  it("exposes fonts, radii and the project palette", () => {
    expect(tokens.fonts).toEqual({ sans: "Inter" });
    expect(tokens.radius.pill).toBe(999);
    expect(Object.keys(tokens.project)).toHaveLength(10);
  });
});

describe("IMPORTANCE_COLORS", () => {
  it("marks every importance with a color of its own, Normal green", () => {
    expect(IMPORTANCE_COLORS).toEqual({
      asap: "coral",
      prioritized: "amber",
      normal: "green",
      nice_to_have: "slate",
    });
  });
});

describe("STATUS_COLORS", () => {
  it("draws In progress in blue, never in the gray of the other tags", () => {
    expect(STATUS_COLORS.in_progress).toBe("blue");
    expect(STATUS_COLORS.not_started).toBeNull();
  });
});

describe("project colors", () => {
  it("keeps ASAP's red and Personal's tangerine apart: red leans further from orange", () => {
    const red = parseHex(tokens.project.coral);
    const tangerine = parseHex(tokens.project.orange);
    expect(red !== null && tangerine !== null && tangerine.g - red.g >= 10).toBe(true);
  });
});
