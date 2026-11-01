export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

const HEX = /^#(?:([\da-f]{3})|([\da-f]{6}))$/i;

/** `#rgb` or `#rrggbb` → channels 0–255; anything else (rgba(), names) → `null`. */
export const parseHex = (hex: string): null | Rgb => {
  const match = HEX.exec(hex);
  if (match === null) {
    return null;
  }
  const digits = match[2] ?? (match[1] ?? "").replaceAll(/[\da-f]/gi, "$&$&");
  const channel = (offset: number): number => Number.parseInt(digits.slice(offset, offset + 2), 16);
  return { r: channel(0), g: channel(2), b: channel(4) };
};

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance (0 = black, 1 = white). */
export const relativeLuminance = ({ r, g, b }: Rgb): number =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG contrast ratio (1–21), order-independent; `null` when a colour is not hex. */
export const contrastRatio = (hexA: string, hexB: string): null | number => {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (a === null || b === null) {
    return null;
  }
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const RGBA = /^rgba?\(([^)]*)\)$/i;

const hex2 = (value: number): string => Math.round(value).toString(16).padStart(2, "0");

/** `rgb(r, g, b)` / `rgba(r, g, b, a)` → channels and alpha; `null` for anything else. */
const parseRgba = (text: string): null | { alpha: number; rgb: Rgb } => {
  const parts = RGBA.exec(text)?.[1]
    ?.split(",")
    .map((part) => Number(part.trim()));
  const [r, g, b, alpha = 1] = parts ?? [];
  return r === undefined ||
    g === undefined ||
    b === undefined ||
    [r, g, b, alpha].some((value) => Number.isNaN(value))
    ? null
    : { alpha: Math.min(1, alpha), rgb: { r, g, b } };
};

/**
`top` laid over the opaque `bottom` as the browser composites it, as `#rrggbb` (lower case, each
channel rounded). `top` is `#rgb`, `#rrggbb` or `rgb()`/`rgba()`; an unparsable colour gives `""`,
which no contrast check passes.
*/
export const composite = (top: string, bottom: string): string => {
  const base = parseHex(bottom);
  const above = parseHex(top);
  const wash = above === null ? parseRgba(top) : { alpha: 1, rgb: above };
  if (base === null || wash === null) {
    return "";
  }
  const { alpha, rgb } = wash;
  const mix = (over: number, under: number): string => hex2(over * alpha + under * (1 - alpha));
  return `#${mix(rgb.r, base.r)}${mix(rgb.g, base.g)}${mix(rgb.b, base.b)}`;
};

/** APCA 0.0.98G-4g luminance of a colour (soft-clamped near black). */
const apcaLuminance = ({ r, g, b }: Rgb): number => {
  const y =
    0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
  return y > 0.022 ? y : y + (0.022 - y) ** 1.414;
};

/**
APCA 0.0.98G-4g lightness contrast of `text` on `ground`, signed: positive for dark text on a
lighter ground, negative for light text on a darker one (|Lc| 60 is body text's floor in the
APCA table, 45 large or bold text). `0` for equal luminance or a colour that is not hex.
*/
export const apcaLc = (text: string, ground: string): number => {
  const fg = parseHex(text);
  const bg = parseHex(ground);
  if (fg === null || bg === null) {
    return 0;
  }
  const yText = apcaLuminance(fg);
  const yGround = apcaLuminance(bg);
  if (Math.abs(yGround - yText) < 0.0005) {
    return 0;
  }
  if (yGround > yText) {
    const sapc = (yGround ** 0.56 - yText ** 0.57) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (yGround ** 0.65 - yText ** 0.62) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
};
