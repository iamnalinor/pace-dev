import type {
  ColorRole,
  ColorScheme,
  HueColors,
  HueName,
  HueRole,
  ProjectColorName,
  ThemeName,
  TokensV2,
  TypeRole,
  TypeSize,
  TypeStyle,
} from "./token-types.ts";

import tokensJson from "./tokens.json";

// Tokens v2 (spec: context/design/redesign-spec.md §3). One source, `tokens.json`, typed in
// `token-types.ts`; this file reads it through accessors.

export const THEMES: readonly ThemeName[] = ["dark", "light"];

export const HUE_NAMES: readonly HueName[] = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "slate",
];

const V2: TokensV2 = tokensJson;

const flatten = (
  scheme: ColorScheme,
  hues: Readonly<Record<HueName, HueColors>>,
): Readonly<Record<ColorRole, string>> => {
  const hueRoles = Object.fromEntries(
    HUE_NAMES.flatMap((name) => [
      [`hue.${name}.stroke`, hues[name].stroke],
      [`hue.${name}.ink`, hues[name].ink],
      [`hue.${name}.tint`, hues[name].tint],
    ]),
  ) as Readonly<Record<HueRole, string>>;
  return {
    ...hueRoles,
    accent: scheme.accent.default,
    "accent.on": scheme.accent.on,
    "accent.pressed": scheme.accent.pressed,
    "accent.text": scheme.accent.text,
    accentQuiet: scheme.accentQuiet,
    "bg.app": scheme.bg.app,
    "bg.cell": scheme.bg.cell,
    "bg.elevated": scheme.bg.elevated,
    "bg.inset": scheme.bg.inset,
    "bg.sidebar": scheme.bg.sidebar,
    dangerQuiet: scheme.dangerQuiet,
    "fill.1": scheme.fill[1],
    "fill.2": scheme.fill[2],
    "fill.3": scheme.fill[3],
    "fill.4": scheme.fill[4],
    focus: scheme.focus,
    grid: scheme.grid,
    "label.primary": scheme.label.primary,
    "label.quaternary": scheme.label.quaternary,
    "label.secondary": scheme.label.secondary,
    "label.tertiary": scheme.label.tertiary,
    logo: scheme.logo,
    outline: scheme.outline,
    scrim: scheme.scrim,
    selection: scheme.selection,
    separator: scheme.separator.default,
    "separator.opaque": scheme.separator.opaque,
    "status.danger": scheme.status.danger,
    "status.question": scheme.status.question,
    "status.success": scheme.status.success,
    "status.warn": scheme.status.warn,
    warnQuiet: scheme.warnQuiet,
  };
};

const COLORS: Readonly<Record<ThemeName, Readonly<Record<ColorRole, string>>>> = {
  dark: flatten(V2.color.dark, V2.hue.dark),
  light: flatten(V2.color.light, V2.hue.light),
};

/** Every colour role, for sweeps (tests, generators). */
export const COLOR_ROLES: readonly ColorRole[] = Object.keys(COLORS.light) as ColorRole[];

/** The colour of `role` in `theme`: `#rrggbb`, or `rgba()` for translucent roles. */
export const color = (theme: ThemeName, role: ColorRole): string => COLORS[theme][role];

/** A hue's `stroke`, `ink` and `tint` in `theme`. */
export const hue = (theme: ThemeName, name: HueName): HueColors => V2.hue[theme][name];

/** A box-shadow value (CSS syntax; `"none"` where the theme uses a tonal step instead). */
export const shadow = (theme: ThemeName, name: keyof ColorScheme["shadow"]): string =>
  V2.color[theme].shadow[name];

/** A type role at the phone or the desktop size class. */
export const typeRole = (role: TypeRole, size: TypeSize): TypeStyle => V2.type[role][size];

/** Whether a type role sets tabular figures (the numeric roles). */
export const isTabular = (role: TypeRole): boolean => V2.type[role].tabular === true;

export const TYPE_ROLES: readonly TypeRole[] = Object.keys(V2.type) as TypeRole[];

export const font: TokensV2["font"] = V2.font;

/** The 4-pt spacing scale (px/dp), keyed by step. */
export const space: TokensV2["space"] = V2.space;

/** Layout roles: gutters, row padding, content and region widths (px/dp). */
export const layout: TokensV2["layout"] = V2.layout;

export const radius: TokensV2["radius"] = V2.radius;

/** Hit targets, icon sizes, stroke and component sizes. */
export const size: TokensV2["size"] = V2.size;

/** Durations (ms), easings (cubic-bezier), springs and the reduced-motion rule. */
export const motion: TokensV2["motion"] = V2.motion;

export const z: TokensV2["z"] = V2.z;

/**
The hue of a stored project colour. The ten stored names stay (the event schema is not widened);
`coral` is the family's `red`.
*/
export const projectHue = (name: ProjectColorName): HueName => (name === "coral" ? "red" : name);
