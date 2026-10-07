import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
The design tokens have one source (packages/core/src/design/tokens.json). This script
renders them for Tailwind v4 on the web (CSS variables per theme). The Expo app reads
the JSON directly in tailwind.config.js. Runs as part of `bun lint`; CI fails if the
generated file drifts from the source.
*/
type Palette = Readonly<Record<string, string>>;
type Tokens = {
  readonly fonts: { readonly mono: string; readonly sans: string };
  readonly radius: Readonly<Record<string, number>>;
  readonly project: Palette;
  readonly dark: Palette;
  readonly light: Palette;
};

const root = path.join(import.meta.dir, "..");
const tokens = JSON.parse(
  readFileSync(path.join(root, "packages/core/src/design/tokens.json"), "utf8"),
) as Tokens;

const cssVars = (palette: Palette, indent: string): string =>
  Object.entries(palette)
    .map(([name, value]) => `${indent}--pace-${name}: ${value};`)
    .join("\n");

const themeVars = Object.keys(tokens.dark)
  .map((name) => `  --color-${name}: var(--pace-${name});`)
  .join("\n");
const projectVars = Object.entries(tokens.project)
  .map(([name, value]) => `  --color-project-${name}: ${value};`)
  .join("\n");
const radiusVars = Object.entries(tokens.radius)
  .map(([name, value]) => `  --radius-${name}: ${value}px;`)
  .join("\n");

const css = `/* Generated from packages/core/src/design/tokens.json by scripts/generate-tokens.ts. Do not edit. */
:root,
:root[data-theme="dark"] {
  color-scheme: dark;
${cssVars(tokens.dark, "  ")}
}

:root[data-theme="light"] {
  color-scheme: light;
${cssVars(tokens.light, "  ")}
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    color-scheme: light;
${cssVars(tokens.light, " ".repeat(4))}
  }
}

@theme inline {
  --font-sans: "${tokens.fonts.sans} Variable", "${tokens.fonts.sans}", system-ui, sans-serif;
  --font-mono: "${tokens.fonts.mono} Variable", "${tokens.fonts.mono}", ui-monospace, monospace;
${themeVars}
${projectVars}
${radiusVars}
}
`;

writeFileSync(path.join(root, "apps/web/src/tokens.css"), css);
console.log("tokens: apps/web/src/tokens.css");
