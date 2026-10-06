import { tokens } from "@pace/core";

import { paletteVariables, resolveScheme } from "./theme.ts";

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
  it("maps every palette token to a --pace-* CSS variable", () => {
    const dark = paletteVariables("dark");
    expect(dark["--pace-bg"]).toBe(tokens.dark.bg);
    expect(dark["--pace-accentText"]).toBe(tokens.dark.accentText);
    expect(Object.keys(dark)).toHaveLength(Object.keys(tokens.dark).length);
  });

  it("uses the light palette for the light scheme", () => {
    expect(paletteVariables("light")["--pace-bg"]).toBe(tokens.light.bg);
  });
});
