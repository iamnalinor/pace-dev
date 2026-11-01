// The v1 tokens, kept only so the app keeps building until Task 2.2 switches it to v2 and deletes
// this file. Everything here is deprecated (not tagged `@deprecated`: the lint rule would force a
// disable at each of the app's many call sites for one task's worth of time).

import type { ProjectColorName } from "./token-types.ts";

import tokensJson from "./tokens.json";

/** The v1 palette's names. Deprecated: removed in Task 2.2. */
export type PaletteName =
  | "accent"
  | "accentFg"
  | "accentQuiet"
  | "accentQuietFg"
  | "accentQuietText"
  | "accentText"
  | "bg"
  | "faint"
  | "fg2"
  | "fg"
  | "ink-amber"
  | "ink-blue"
  | "ink-coral"
  | "ink-green"
  | "ink-orange"
  | "ink-pink"
  | "ink-slate"
  | "ink-teal"
  | "ink-violet"
  | "ink-yellow"
  | "inverse"
  | "inverseFg"
  | "line"
  | "muted"
  | "onColor"
  | "question"
  | "raised"
  | "surface"
  | "track"
  | "warn";

/** The v1 radius names. Deprecated: removed in Task 2.2. */
export type RadiusName = "lg" | "md" | "pill" | "sm" | "xl";

/** One theme of the v1 palette. Deprecated: removed in Task 2.2. */
export type Palette = Readonly<Record<PaletteName, string>>;

/** The shape of the v1 token block. Deprecated: removed in Task 2.2. */
export type Tokens = {
  readonly fonts: { readonly sans: string };
  readonly radius: Readonly<Record<RadiusName, number>>;
  readonly project: Readonly<Record<ProjectColorName, string>>;
  readonly dark: Palette;
  readonly light: Palette;
};

/**
The v1 design tokens (`tokens.json` › `v1`), typed. `line`/`track` are rgba strings.
Deprecated: Use `color()`, `hue()` and the v2 scales; removed in Task 2.2.
*/
export const tokens: Tokens = tokensJson.v1;

/**
Each importance's color from the project palette: red for ASAP, warm for Prioritized, green
for Normal (the calm default), cool for Nice-to-have. Shown as a tinted tag (`ink-*` text on
a light wash of the color).
Deprecated: Replaced by hue tags (`hue()`); removed in Task 2.2.
*/
export const IMPORTANCE_COLORS: Readonly<
  Record<"asap" | "nice_to_have" | "normal" | "prioritized", null | ProjectColorName>
> = {
  asap: "coral",
  prioritized: "amber",
  normal: "green",
  nice_to_have: "slate",
};

/**
A task status's tag color: work under way stands out in blue; the rest stay neutral.
Deprecated: Replaced by the v2 status words; removed in Task 2.2.
*/
export const STATUS_COLORS: Readonly<
  Record<"in_progress" | "not_started" | "paused" | "waiting", null | ProjectColorName>
> = {
  not_started: null,
  in_progress: "blue",
  paused: null,
  waiting: null,
};

/**
The text color of a tag in a project color: the color itself on dark, a deeper shade on light.
Deprecated: Use `hue(theme, projectHue(name)).ink`; removed in Task 2.2.
*/
export const inkOf = (name: ProjectColorName): PaletteName => `ink-${name}`;

/**
How strong the wash behind a colored tag is (the `ink-*` contrast is checked against it).
Deprecated: The v2 hue `tint` carries its own alpha; removed in Task 2.2.
*/
export const TAG_TINT = 0.22;
