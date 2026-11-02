// The root workspace has no vitest; Bun's runner exposes the same describe/it/expect API.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { COLOR_ROLES, space, THEMES, TYPE_ROLES, typeRole } from "@pace/core";

import {
  colorClassName,
  generatedClasses,
  generateDesign,
  tailwindTheme,
  themeVars,
  typeClassName,
} from "./generate-design.ts";

const read = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("generate-design", () => {
  it("writes every file it generates as committed (run `bun design:generate`)", () => {
    for (const [path, content] of Object.entries(generateDesign())) {
      expect(read(path), path).toBe(content);
    }
  });

  it("defines every colour role as a CSS variable in both themes", () => {
    for (const theme of THEMES) {
      const vars = themeVars(theme);
      for (const role of COLOR_ROLES) {
        expect(vars[`--pace-${colorClassName(role)}`], `${theme} ${role}`).toMatch(/^(#|rgba\()/);
      }
      expect(Object.keys(vars)).toHaveLength(COLOR_ROLES.length);
    }
  });

  it("names colours after their role: dots become dashes, `bg.` `status.` and `.default` go", () => {
    expect(colorClassName("bg.app")).toBe("app");
    expect(colorClassName("label.secondary")).toBe("label-secondary");
    expect(colorClassName("fill.3")).toBe("fill-3");
    expect(colorClassName("accent")).toBe("accent");
    expect(colorClassName("accent.on")).toBe("accent-on");
    expect(colorClassName("accentQuiet")).toBe("accent-quiet");
    expect(colorClassName("status.danger")).toBe("danger");
    expect(colorClassName("hue.blue.ink")).toBe("hue-blue-ink");
    const names = COLOR_ROLES.map((role) => colorClassName(role));
    expect(new Set(names).size).toBe(names.length);
  });

  it("points every colour class at its variable, so one class works in both themes", () => {
    const { colors } = tailwindTheme();
    for (const role of COLOR_ROLES) {
      const name = colorClassName(role);
      expect(colors[name]).toBe(`var(--pace-${name})`);
    }
  });

  it("keeps spacing keys px-faithful and limited to the space tokens", () => {
    const { spacing } = tailwindTheme();
    const values = Object.values(spacing).map((value) => Number(value.replace("px", "")));
    expect(values.toSorted((a, b) => a - b)).toEqual(Object.values(space));
    for (const [key, value] of Object.entries(spacing)) {
      expect(`${Number(key) * 4}px`, key).toBe(value);
    }
  });

  it("gives every type role its phone size and its desktop size from the lg breakpoint", () => {
    const { fontSize, screens, typeDesktop } = tailwindTheme();
    expect(screens["lg"]).toBe("1024px");
    expect(fontSize[typeClassName("body")]).toEqual([
      "16px",
      { fontWeight: "400", lineHeight: "22px" },
    ]);
    expect(fontSize["largeTitle"]?.[1].letterSpacing).toBe("-0.7px");
    expect(typeDesktop["body"]).toEqual({
      fontSize: "15px",
      letterSpacing: "0px",
      lineHeight: "21px",
    });
    for (const role of TYPE_ROLES) {
      // The desktop rules carry no weight, so the phone weight must hold at every width.
      expect(typeRole(role, "desktop").weight, role).toBe(typeRole(role, "phone").weight);
    }
    expect(typeClassName("numeric.live")).toBe("numeric-live");
    expect(Object.keys(fontSize)).toEqual(TYPE_ROLES.map((role) => typeClassName(role)));
  });

  it("lists the classes the lint rule accepts: token classes, never Tailwind's own scales", () => {
    const classes = new Set(generatedClasses());
    for (const name of [
      "bg-app",
      "text-label-primary",
      "border-separator",
      "border-outline",
      "bg-hue-blue-tint",
      "text-hue-red-ink",
      "text-body",
      "text-numeric-live",
      "p-4",
      "gap-0.5",
      "-mt-2",
      "h-hit-web",
      "min-h-row",
      "w-full",
      "rounded-pill",
      "rounded-t-sheet",
      "flex-row",
    ]) {
      expect(classes.has(name), name).toBe(true);
    }
    for (const name of ["p-1.5", "gap-7", "h-11", "text-sm", "text-[13px]", "rounded-full"]) {
      expect(classes.has(name), name).toBe(false);
    }
  });

  it("compiles rem to 16 px on Android as on the web (F-AND-01)", () => {
    // NativeWind's default is 14: every rem class was 12.5 % smaller on the phone than on the web.
    expect(read("apps/app/metro.config.js")).toMatch(/\binlineRem: 16\b/);
  });
});
