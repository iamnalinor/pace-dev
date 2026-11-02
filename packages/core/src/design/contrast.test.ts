import { describe, expect, it } from "vitest";

import { apcaLc, composite, contrastRatio, parseHex, relativeLuminance } from "./contrast.ts";
import { type ContrastTarget, USED_PAIRS } from "./pairs.ts";
import { color, THEMES } from "./tokens.ts";

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

describe("apcaLc", () => {
  it("reproduces the APCA 0.0.98G reference values", () => {
    expect(apcaLc("#888888", "#ffffff")).toBeCloseTo(63.1, 0);
    expect(apcaLc("#ffffff", "#888888")).toBeCloseTo(-68.5, 0);
    expect(apcaLc("#000000", "#aaaaaa")).toBeCloseTo(58.1, 0);
  });

  it("is positive for dark on light, negative for light on dark, 0 for equal or non-hex", () => {
    expect(apcaLc("#000000", "#ffffff")).toBeGreaterThan(100);
    expect(apcaLc("#ffffff", "#000000")).toBeLessThan(-100);
    expect(apcaLc("#777777", "#777777")).toBe(0);
    expect(apcaLc("rgba(0,0,0,0.5)", "#ffffff")).toBe(0);
  });
});

describe("composite", () => {
  it("lays a translucent colour over an opaque one, per channel rounded", () => {
    expect(composite("rgba(14, 122, 69, 0.12)", "#ffffff")).toBe("#e2efe9");
    expect(composite("rgba(0, 0, 0, 0.5)", "#ffffff")).toBe("#808080");
  });

  it("passes opaque colours through as lower-case #rrggbb", () => {
    expect(composite("#ABC", "#000000")).toBe("#aabbcc");
    expect(composite("#12141C", "#ffffff")).toBe("#12141c");
    expect(composite("rgba(1, 2, 3, 1)", "#ffffff")).toBe("#010203");
    expect(composite("rgb(1, 2, 3)", "#ffffff")).toBe("#010203");
  });

  it("gives an empty string for what it cannot read", () => {
    expect(composite("blue", "#ffffff")).toBe("");
    expect(composite("rgba(1, 2, 3, 0.5)", "rgba(0, 0, 0, 0.5)")).toBe("");
  });
});

const TARGETS: Readonly<Record<ContrastTarget, { lc: number; ratio: number }>> = {
  text: { ratio: 4.5, lc: 75 },
  meta: { ratio: 4.5, lc: 60 },
  textSmall: { ratio: 4.5, lc: 50 },
  large: { ratio: 3, lc: 45 },
  ui: { ratio: 3, lc: 0 },
};

describe("USED_PAIRS (tokens v2)", () => {
  it.each(THEMES)("%s: every pair reaches its target on its real ground", (theme) => {
    const measured = USED_PAIRS.map(({ bg, fg, over, target }) => {
      const below = composite(color(theme, over ?? "bg.cell"), "#ffffff");
      const ground = composite(color(theme, bg), below);
      const text = composite(color(theme, fg), ground);
      const ratio = contrastRatio(text, ground) ?? 0;
      const lc = Math.abs(apcaLc(text, ground));
      const need = TARGETS[target];
      const where = over === undefined ? bg : `${bg} over ${over}`;
      return {
        label: `${fg} on ${where} (${target}): ${ratio.toFixed(2)}:1, Lc ${lc.toFixed(1)}`,
        met: ratio >= need.ratio && lc >= need.lc,
      };
    });
    const failures = measured.filter(({ met }) => !met).map(({ label }) => label);
    expect(failures).toEqual([]);
  });

  it("covers the label levels, accent, status, outline, focus and every hue", () => {
    const fgs = new Set(USED_PAIRS.map(({ fg }) => fg));
    const required = [
      "label.primary",
      "label.secondary",
      "label.tertiary",
      "accent.text",
      "accent.on",
      "status.danger",
      "status.warn",
      "status.question",
      "outline",
      "focus",
      "hue.red.ink",
      "hue.slate.stroke",
    ] as const;
    expect(required.filter((role) => !fgs.has(role))).toEqual([]);
  });
});
