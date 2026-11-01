// The design system's public surface: tokens v2, contrast maths and the used pairs.

export {
  apcaLc,
  composite,
  contrastRatio,
  parseHex,
  relativeLuminance,
  type Rgb,
} from "./design/contrast.ts";
export { type ContrastPair, type ContrastTarget, USED_PAIRS } from "./design/pairs.ts";
export type {
  Bezier,
  ColorRole,
  HueColors,
  HueName,
  MotionStep,
  ProjectColorName,
  SpaceStep,
  ThemeName,
  TypeRole,
  TypeSize,
  TypeStyle,
} from "./design/token-types.ts";
export {
  IMPORTANCE_COLORS,
  type Palette,
  type PaletteName,
  type RadiusName,
  STATUS_COLORS,
  type Tokens,
  tokens,
} from "./design/tokens-v1.ts";
export {
  color,
  COLOR_ROLES,
  font,
  hue,
  HUE_NAMES,
  isTabular,
  layout,
  motion,
  projectHue,
  radius,
  shadow,
  size,
  space,
  THEMES,
  TYPE_ROLES,
  typeRole,
  z,
} from "./design/tokens.ts";
