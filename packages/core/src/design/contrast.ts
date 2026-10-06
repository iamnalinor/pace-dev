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
