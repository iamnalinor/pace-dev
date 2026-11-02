import { readFileSync } from "node:fs";

import { documentGround, type ThemeName, THEMES } from "@pace/core";

/**
The web page's own colour literals, generated from the tokens (spec §7, F-WEB-02): the files are
hand-written around marker lines, and `bun design:generate` rewrites what stands between them, so a
palette change reaches the boot script, `index.html` and the manifest without a hand-typed hex.
`generate-design.ts` merges `pageFiles` into its output (and checks them like the rest).
*/

export const ROOT = new URL("../../", import.meta.url);

/** The committed text of a file (a path from the repo root). */
export const committed = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");

export const GENERATED_BOOT = "apps/app/public/theme-boot.js";
export const GENERATED_HTML = "apps/app/public/index.html";
export const GENERATED_MANIFEST = "apps/app/public/manifest.webmanifest";

type Markers = { readonly close: string; readonly open: string };

/**
`source` with the lines between the `open` and `close` marker lines replaced by `body` (indented
like the markers). A file that lost its markers is an error, not a silent no-op.
*/
export const spliceBlock = (source: string, markers: Markers, body: readonly string[]): string => {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === markers.open);
  const end = lines.findIndex((line, index) => index > start && line.trim() === markers.close);
  if (start === -1 || end === -1) {
    throw new Error(`generated block not found: ${markers.open} … ${markers.close}`);
  }
  const marker = lines[start] ?? "";
  const indent = marker.slice(0, marker.length - marker.trimStart().length);
  const inner = body.map((line) => (line === "" ? "" : `${indent}${line}`));
  return [...lines.slice(0, start + 1), ...inner, ...lines.slice(end)].join("\n");
};

const ground = (theme: ThemeName): string => documentGround(theme, false);

const indented = (lines: readonly string[], by: number): string[] =>
  lines.map((line) => `${" ".repeat(by)}${line}`);

const bootBlock = (): readonly string[] => [
  "const GROUNDS = {",
  ...THEMES.map((theme) => `  ${theme}: ${JSON.stringify(ground(theme))},`),
  "};",
];

const groundRule = (selector: string, theme: ThemeName): readonly string[] => [
  `${selector} {`,
  `  --pace-page: ${ground(theme)};`,
  `  color-scheme: ${theme};`,
  "}",
];

/** The page ground and `color-scheme`: the OS's (dark unless it says light), then the app's own choice. */
const groundCss = (): readonly string[] => [
  '<style id="pace-ground">',
  ...indented(groundRule(":root", "dark"), 2),
  "  @media (prefers-color-scheme: light) {",
  ...indented(groundRule(":root", "light"), 4),
  "  }",
  ...indented(
    THEMES.flatMap((theme) => groundRule(`:root[data-theme="${theme}"]`, theme)),
    2,
  ),
  "  html,",
  "  body {",
  "    background-color: var(--pace-page);",
  "  }",
  "</style>",
];

const htmlBlock = (): readonly string[] => [
  ...THEMES.map(
    (theme) =>
      `<meta name="theme-color" content="${ground(theme)}" media="(prefers-color-scheme: ${theme})" />`,
  ),
  ...groundCss(),
];

/** The manifest has one value per key, so the installed app's splash and bar take the app's default (dark). */
const manifestJson = (source: string): string =>
  source
    .replace(/("background_color": )"[^"]*"/u, (_match, key: string) => `${key}"${ground("dark")}"`)
    .replace(/("theme_color": )"[^"]*"/u, (_match, key: string) => `${key}"${ground("dark")}"`);

/** Path → content of the page's files, from `read` (the committed text of a path). */
export const pageFiles = (read: (path: string) => string): Readonly<Record<string, string>> => ({
  [GENERATED_BOOT]: spliceBlock(
    read(GENERATED_BOOT),
    { close: "// </generated:grounds>", open: "// <generated:grounds>" },
    bootBlock(),
  ),
  [GENERATED_HTML]: spliceBlock(
    read(GENERATED_HTML),
    { close: "<!-- </generated:document> -->", open: "<!-- <generated:document> -->" },
    htmlBlock(),
  ),
  [GENERATED_MANIFEST]: manifestJson(read(GENERATED_MANIFEST)),
});
