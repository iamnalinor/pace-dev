import { describe, expect, it } from "vitest";

import type { HueName, ProjectColorName } from "./token-types.ts";

import { CATEGORY_HUES } from "../tracking/categories.ts";
import { parseHex } from "./contrast.ts";
import tokensJson from "./tokens.json";
import {
  color,
  COLOR_ROLES,
  font,
  hue,
  HUE_NAMES,
  isTabular,
  layout,
  motion,
  projectHue,
  radius,
  shadow,
  size,
  space,
  THEMES,
  TYPE_ROLES,
  typeRole,
  z,
} from "./tokens.ts";

const byName = (a: string, b: string): number => a.localeCompare(b);

const lin = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** sRGB hex → OKLab (Björn Ottosson). */
const oklab = (hex: string): readonly [number, number, number] => {
  const rgb = parseHex(hex);
  if (rgb === null) {
    throw new TypeError(`not a hex colour: ${hex}`);
  }
  const [r, g, b] = [lin(rgb.r), lin(rgb.g), lin(rgb.b)] as const;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/** Every leaf path of a nested object, `a.b.c`. */
const leafPaths = (node: unknown, prefix = ""): string[] =>
  typeof node === "object" && node !== null
    ? Object.entries(node).flatMap(([key, child]) =>
        leafPaths(child, prefix === "" ? key : `${prefix}.${key}`),
      )
    : [prefix];

describe("colour roles", () => {
  it("defines the same keys in both themes", () => {
    expect(leafPaths(tokensJson.color.dark).toSorted(byName)).toEqual(
      leafPaths(tokensJson.color.light).toSorted(byName),
    );
  });

  it.each(THEMES)("%s: every role resolves to a colour string", (theme) => {
    const bad = COLOR_ROLES.filter(
      (role) => !/^(?:#[\da-f]{6}|rgba\(.+\))$/i.test(color(theme, role)),
    );
    expect(bad).toEqual([]);
  });

  it("reads the notebook palette (direction A)", () => {
    expect(color("light", "bg.app")).toBe("#F4F5F9");
    expect(color("dark", "bg.elevated")).toBe("#1F2333");
    expect(color("light", "accent")).toBe("#2E4AD6");
    expect(color("dark", "accent.text")).toBe("#ACBAFF");
    expect(color("light", "separator.opaque")).toBe("#DFE1E9");
    expect(color("dark", "logo")).toBe("#C8F03C");
    expect(color("light", "fill.2")).toBe("rgba(20, 28, 70, 0.07)");
    expect(shadow("dark", "card")).toBe("none");
  });

  it("keeps every hue role in the role list", () => {
    for (const name of HUE_NAMES) {
      for (const part of ["stroke", "ink", "tint"] as const) {
        expect(COLOR_ROLES).toContain(`hue.${name}.${part}`);
      }
    }
  });
});

describe("hue family", () => {
  it("has the twelve hues and slate", () => {
    expect(HUE_NAMES).toHaveLength(13);
    expect(new Set(HUE_NAMES).size).toBe(13);
  });

  it.each(THEMES)("%s: every hue has a stroke, an ink and a tint", (theme) => {
    const bad = HUE_NAMES.filter((name) => {
      const { ink, stroke, tint } = hue(theme, name);
      return (
        parseHex(stroke) === null ||
        parseHex(ink) === null ||
        !/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/.test(tint)
      );
    });
    expect(bad).toEqual([]);
  });

  it.each(THEMES)("%s: the twelve category hues are pairwise ΔE(OKLab) ≥ 0.05", (theme) => {
    const used = [...new Set(Object.values(CATEGORY_HUES))];
    const close = used.flatMap((a, i) =>
      used
        .slice(i + 1)
        .map((b) => ({ a, b, distance: deltaE(hue(theme, a).stroke, hue(theme, b).stroke) }))
        .filter(({ distance }) => distance < 0.05),
    );
    expect(close).toEqual([]);
  });
});

describe("projectHue", () => {
  it("maps the ten stored project colours into the family, coral to red", () => {
    const stored: readonly ProjectColorName[] = [
      "blue",
      "violet",
      "green",
      "amber",
      "coral",
      "pink",
      "teal",
      "slate",
      "orange",
      "yellow",
    ];
    const mapped: readonly HueName[] = stored.map((name) => projectHue(name));
    expect(mapped).toEqual([
      "blue",
      "violet",
      "green",
      "amber",
      "red",
      "pink",
      "teal",
      "slate",
      "orange",
      "yellow",
    ]);
    for (const name of mapped) {
      expect(HUE_NAMES).toContain(name);
    }
  });
});

describe("type roles", () => {
  it("has the thirteen roles of the spec", () => {
    expect(TYPE_ROLES.toSorted(byName)).toEqual(
      [
        "largeTitle",
        "title1",
        "title2",
        "headline",
        "body",
        "callout",
        "subhead",
        "footnote",
        "caption",
        "caption2",
        "numeric.live",
        "numeric.value",
        "numeric.stat",
      ].toSorted(byName),
    );
  });

  it("reads size, line, weight and tracking per size class", () => {
    expect(typeRole("body", "phone")).toEqual({ size: 16, line: 22, weight: 400, tracking: 0 });
    expect(typeRole("body", "desktop")).toEqual({ size: 15, line: 21, weight: 400, tracking: 0 });
    expect(typeRole("largeTitle", "phone")).toEqual({
      size: 32,
      line: 38,
      weight: 700,
      tracking: -0.022,
    });
    expect(typeRole("numeric.stat", "desktop")).toEqual({
      size: 24,
      line: 28,
      weight: 600,
      tracking: 0,
    });
  });

  it("keeps the floors: nothing functional below 11, every line taller than its size", () => {
    const bad = TYPE_ROLES.flatMap((role) =>
      (["phone", "desktop"] as const)
        .filter((sizeClass) => {
          const { line, size: px } = typeRole(role, sizeClass);
          return px < 11 || line <= px;
        })
        .map((sizeClass) => `${role}/${sizeClass}`),
    );
    expect(bad).toEqual([]);
  });

  it("sets tabular figures on the numeric roles only", () => {
    expect(TYPE_ROLES.filter((role) => isTabular(role)).toSorted(byName)).toEqual([
      "numeric.live",
      "numeric.stat",
      "numeric.value",
    ]);
    expect(font.features.numeric).toEqual(["tnum", "cv11"]);
  });
});

describe("scales", () => {
  it("is a 4-pt spacing scale of twelve steps", () => {
    expect(Object.values(space)).toEqual([0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
    expect(space["5"]).toBe(16);
  });

  it("has the radius steps of the spec", () => {
    expect(radius).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, sheet: 28, pill: 999 });
  });

  it("has the layout roles of the spec", () => {
    expect(layout.gutter).toEqual({ phone: 16, desktop: 32 });
    expect(layout.rowPadY).toEqual({ phone: 12, desktop: 10 });
    expect(layout.sectionGap).toEqual({ phone: 24, desktop: 28 });
    expect(layout.sidebarWidth).toBe(248);
    expect([layout.inspectorMin, layout.inspectorWidth, layout.inspectorMax]).toEqual([
      360, 400, 480,
    ]);
    expect([layout.contentMax, layout.contentMaxWide]).toEqual([720, 960]);
    expect([layout.dialog, layout.popover, layout.rail, layout.navBar]).toEqual([560, 360, 80, 64]);
    expect(layout.breakpoint).toEqual({ medium: 600, expanded: 1024 });
  });

  it("has the hit, icon and component sizes", () => {
    expect([size.hit, size.hitWeb]).toEqual([48, 44]);
    expect(size.icon).toEqual({ inline: 16, control: 20, bar: 24 });
    expect(size.stroke).toBe(1.75);
    expect(size.row).toEqual({ min: 52, compact: 44 });
    expect(size.switch).toEqual({
      track: { width: 52, height: 32 },
      knob: { off: 16, on: 24 },
    });
    expect([size.chip.max, size.tooltip.max]).toEqual([180, 280]);
    expect([size.authCard, size.message, size.narrowColumn, size.toast.max]).toEqual([
      400, 480, 560, 480,
    ]);
  });

  it("has the motion tokens: nothing above 300 ms, exits at 0.7 of the enter", () => {
    expect(motion.duration).toEqual({ xs: 100, sm: 160, md: 220, lg: 280 });
    expect(motion.exit).toEqual({ xs: 70, sm: 110, md: 160, lg: 200 });
    expect(Math.max(...Object.values(motion.duration))).toBeLessThanOrEqual(300);
    expect(motion.easing.enter).toEqual([0.2, 0.8, 0.2, 1]);
    expect(motion.easing.exit).toEqual([0.4, 0, 1, 1]);
    expect(motion.easing.move).toEqual([0.3, 0, 0, 1]);
    expect(motion.spring.sheet).toEqual({ damping: 30, stiffness: 320, mass: 1 });
    expect(motion.spring.thumb).toEqual({ damping: 24, stiffness: 420 });
    expect(motion.reduced.fade).toBe(motion.duration.sm);
  });

  it("has the z layers in order", () => {
    expect(z).toEqual({ sticky: 10, overlay: 40, toast: 50, tooltip: 60 });
  });
});
