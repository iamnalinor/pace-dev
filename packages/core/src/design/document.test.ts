import { describe, expect, it } from "vitest";

import { composite } from "./contrast.ts";
import { documentGround } from "./document.ts";
import { color, THEMES } from "./tokens.ts";

describe("documentGround", () => {
  it("is the app ground of the theme, as lower-case hex", () => {
    expect(documentGround("light", false)).toBe(color("light", "bg.app").toLowerCase());
    expect(documentGround("dark", false)).toBe(color("dark", "bg.app").toLowerCase());
  });

  it("is that ground under the scrim while a sheet is up", () => {
    for (const theme of THEMES) {
      expect(documentGround(theme, true)).toBe(
        composite(color(theme, "scrim"), color(theme, "bg.app")),
      );
    }
  });

  it("dims: darker than the ground in both themes, still a hex colour", () => {
    expect(documentGround("light", true)).toBe("#a9aab1");
    expect(documentGround("dark", true)).toBe("#060709");
    for (const theme of THEMES) {
      expect(documentGround(theme, true)).toMatch(/^#[\da-f]{6}$/u);
      expect(documentGround(theme, true)).not.toBe(documentGround(theme, false));
    }
  });
});
