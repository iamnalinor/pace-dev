// The root workspace has no vitest; Bun's runner exposes the same describe/it/expect API.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { documentGround, THEMES } from "@pace/core";

const read = (path: string): string =>
  readFileSync(new URL(`../../apps/app/public/${path}`, import.meta.url), "utf8");

/** What the OS says, what the storage holds (`"throws"`: blocked site data). */
type Situation = {
  readonly stored: null | string;
  readonly system: "dark" | "light" | "none";
  readonly isBlocked?: boolean;
};

/** Runs `theme-boot.js` against a stand-in browser; answers what it set. */
const boot = ({ isBlocked = false, stored, system }: Situation) => {
  const theme: Record<string, string> = {};
  const contents = ["#000000", "#ffffff"];
  const metas = contents.map((_content, index) => ({
    setAttribute: (name: string, value: string) => {
      if (name === "content") {
        contents[index] = value;
      }
    },
  }));
  // eslint-disable-next-line sonarjs/code-eval -- runs the repo's own boot script in an empty context with stand-in browser objects
  runInNewContext(read("theme-boot.js"), {
    document: {
      documentElement: { dataset: theme },
      querySelectorAll: (selector: string) => (selector.includes("theme-color") ? metas : []),
    },
    localStorage: {
      getItem: (key: string) => {
        if (isBlocked) {
          throw new Error("blocked");
        }
        return key === "pace.theme" ? stored : null;
      },
    },
    matchMedia: (query: string) => ({ matches: query.includes(system) }),
  });
  return { contents, theme: theme["theme"] };
};

describe("theme-boot.js", () => {
  it("applies the stored preference whatever the OS says, in the page and both theme-color metas", () => {
    for (const theme of THEMES) {
      for (const system of ["dark", "light"] as const) {
        const result = boot({ stored: theme, system });
        expect(result.theme).toBe(theme);
        expect(result.contents).toEqual([
          documentGround(theme, false),
          documentGround(theme, false),
        ]);
      }
    }
  });

  it("follows the OS for `system`, a missing preference, garbage and blocked storage; dark unless light", () => {
    const situations = [
      { stored: "system" },
      { stored: null },
      { stored: "garbage" },
      { isBlocked: true, stored: "dark" },
    ];
    for (const situation of situations) {
      expect(boot({ ...situation, system: "light" }).theme).toBe("light");
      expect(boot({ ...situation, system: "dark" }).theme).toBe("dark");
      expect(boot({ ...situation, system: "none" }).theme).toBe("dark");
    }
  });
});

describe("the page's literals", () => {
  const HEX = /#[\da-f]{6}\b/giu;
  const html = read("index.html");
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));

  it("loads theme-boot.js blocking in <head> after the metas it fills, with no inline script (the CSP forbids it)", () => {
    expect(head.match(/<script/gu)).toHaveLength(1);
    expect(head).toContain('<script src="/theme-boot.js"></script>');
    expect(html.match(/<script/gu)).toHaveLength(1);
    expect(head.lastIndexOf('name="theme-color"')).toBeLessThan(head.indexOf("theme-boot.js"));
  });

  it("carries the tokens' ground in the metas, the stylesheet and the boot script (stale after a token change: run `bun design:generate`)", () => {
    for (const theme of THEMES) {
      const ground = documentGround(theme, false);
      expect(html).toContain(`content="${ground}" media="(prefers-color-scheme: ${theme})"`);
      expect(html).toContain(`--pace-page: ${ground}`);
      expect(read("theme-boot.js")).toContain(`${theme}: "${ground}"`);
    }
    const manifest = JSON.parse(read("manifest.webmanifest")) as Record<string, string>;
    expect(manifest["background_color"]).toBe(documentGround("dark", false));
    expect(manifest["theme_color"]).toBe(documentGround("dark", false));
  });

  it("has no colour literal in the page, the boot script or the manifest that the tokens do not own", () => {
    const owned = new Set(THEMES.map((theme) => documentGround(theme, false)));
    for (const file of ["index.html", "theme-boot.js", "manifest.webmanifest"]) {
      const stray = (read(file).match(HEX) ?? []).filter((hex) => !owned.has(hex.toLowerCase()));
      expect(stray, file).toEqual([]);
    }
  });
});
