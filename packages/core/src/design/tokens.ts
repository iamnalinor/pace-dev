import tokensJson from "./tokens.json";

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

export type ProjectColorName =
  | "amber"
  | "blue"
  | "coral"
  | "green"
  | "orange"
  | "pink"
  | "slate"
  | "teal"
  | "violet"
  | "yellow";

export type RadiusName = "lg" | "md" | "pill" | "sm" | "xl";

export type ThemeName = "dark" | "light";

export const THEMES: readonly ThemeName[] = ["dark", "light"];

export type Palette = Readonly<Record<PaletteName, string>>;

export type Tokens = {
  readonly fonts: { readonly sans: string };
  readonly radius: Readonly<Record<RadiusName, number>>;
  readonly project: Readonly<Record<ProjectColorName, string>>;
  readonly dark: Palette;
  readonly light: Palette;
};

/** The design tokens (one source: `tokens.json`), typed. `line`/`track` are rgba strings. */
export const tokens: Tokens = tokensJson;

/**
Each importance's color from the project palette: red for ASAP, warm for Prioritized, green
for Normal (the calm default), cool for Nice-to-have. Shown as a tinted tag (`ink-*` text on
a light wash of the color).
*/
export const IMPORTANCE_COLORS: Readonly<
  Record<"asap" | "nice_to_have" | "normal" | "prioritized", null | ProjectColorName>
> = {
  asap: "coral",
  prioritized: "amber",
  normal: "green",
  nice_to_have: "slate",
};

/** A task status's tag color: work under way stands out in blue; the rest stay neutral. */
export const STATUS_COLORS: Readonly<
  Record<"in_progress" | "not_started" | "paused" | "waiting", null | ProjectColorName>
> = {
  not_started: null,
  in_progress: "blue",
  paused: null,
  waiting: null,
};

/** The text color of a tag in `color`: the project color itself on dark, a deeper shade on light. */
export const inkOf = (color: ProjectColorName): PaletteName => `ink-${color}`;

/** How strong the wash behind a colored tag is (the `ink-*` contrast is checked against it). */
export const TAG_TINT = 0.22;
