import tokensJson from "./tokens.json";

export type PaletteName =
  | "accent"
  | "accentFg"
  | "accentText"
  | "bg"
  | "faint"
  | "fg2"
  | "fg"
  | "inverse"
  | "inverseFg"
  | "line"
  | "muted"
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
  | "pink"
  | "slate"
  | "teal"
  | "violet";

export type RadiusName = "lg" | "md" | "pill" | "sm" | "xl";

export type ThemeName = "dark" | "light";

export const THEMES: readonly ThemeName[] = ["dark", "light"];

export type Palette = Readonly<Record<PaletteName, string>>;

export type Tokens = {
  readonly fonts: { readonly sans: string; readonly mono: string };
  readonly radius: Readonly<Record<RadiusName, number>>;
  readonly project: Readonly<Record<ProjectColorName, string>>;
  readonly dark: Palette;
  readonly light: Palette;
};

/** The design tokens (one source: `tokens.json`), typed. `line`/`track` are rgba strings. */
export const tokens: Tokens = tokensJson;
