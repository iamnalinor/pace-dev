import { color, COLOR_ROLES } from "@pace/core";

import { paletteOf, paletteVariables, resolveScheme } from "./theme.ts";

describe("resolveScheme", () => {
  it("follows the system scheme when the preference is system", () => {
    expect(resolveScheme("system", "light")).toBe("light");
    expect(resolveScheme("system", "dark")).toBe("dark");
  });

  it("falls back to dark when the system scheme is unknown", () => {
    expect(resolveScheme("system", undefined)).toBe("dark");
  });

  it("uses an explicit preference regardless of the system", () => {
    expect(resolveScheme("light", "dark")).toBe("light");
    expect(resolveScheme("dark", "light")).toBe("dark");
  });
});

describe("paletteVariables", () => {
  it("maps every colour role to a --pace-* CSS variable", () => {
    const dark = paletteVariables("dark");
    expect(dark["--pace-app"]).toBe(color("dark", "bg.app"));
    expect(dark["--pace-accent-text"]).toBe(color("dark", "accent.text"));
    expect(Object.keys(dark)).toHaveLength(COLOR_ROLES.length);
  });

  it("uses the light palette for the light scheme", () => {
    expect(paletteVariables("light")["--pace-app"]).toBe(color("light", "bg.app"));
    expect(paletteOf("light")["label.primary"]).toBe(color("light", "label.primary"));
  });
});
