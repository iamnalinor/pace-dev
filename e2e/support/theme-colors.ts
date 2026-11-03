import { readFileSync } from "node:fs";

export type Scheme = "dark" | "light";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path inside the repo
const GENERATED_TOKENS = readFileSync(
  new URL("../../apps/app/src/ui/generated/tokens.ts", import.meta.url),
  "utf8",
);

/** A theme's generated CSS variable (`--pace-app`), read from the committed tokens module. */
const themeVar = (scheme: Scheme, name: string): string => {
  const theme = GENERATED_TOKENS.slice(GENERATED_TOKENS.indexOf(`  ${scheme}: {`));
  // eslint-disable-next-line security/detect-non-literal-regexp -- `name` is one of this file's own literals, never input
  const value = new RegExp(`"${name}": "([^"]+)"`, "u").exec(theme)?.[1];
  if (value === undefined) {
    throw new Error(`${name} is missing from the generated ${scheme} theme`);
  }
  return value;
};

/** `#rrggbb` as lower-case channels. */
const channels = (hex: string): number[] =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/**
The page ground of a theme, worked out here from the generated tokens and not by `documentGround`
(which the page's own code uses): `bg.app`, or that under the scrim a sheet draws.
*/
export const documentGround = (scheme: Scheme, isDimmed: boolean): string => {
  const app = themeVar(scheme, "--pace-app").toLowerCase();
  if (!isDimmed) {
    return app;
  }
  const scrim = (/rgba\(([^)]+)\)/u.exec(themeVar(scheme, "--pace-scrim"))?.[1] ?? "")
    .split(",")
    .map(Number);
  const alpha = scrim[3] ?? 1;
  const mixed = channels(app).map((under, index) =>
    Math.round((scrim[index] ?? 0) * alpha + under * (1 - alpha)),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

/** `#rrggbb` as the browser prints a computed colour. */
export const rgb = (hex: string): string => `rgb(${channels(hex).join(", ")})`;
