import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Brand assets (design board "08 · Step"). The mark is two chevrons and a dot; the favicon is
 * the chevrons on a lime tile. This script is the single source for every logo SVG in
 * assets/logo and for the committed PNG icons of the web app and the Expo app. Rerun with
 * `bun scripts/generate-icons.ts` after changing the mark; the output is deterministic.
 */
type Palette = { readonly accent: string; readonly fg: string; readonly track: string };
type LogoFile = { readonly path: string; readonly svg: string };
type IconSpec = { readonly path: string; readonly size: number; readonly svg: string };

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';
const STROKE = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';

const DARK: Palette = { accent: "#d4ff3a", fg: "#ececee", track: "#3a3a40" };
const LIGHT: Palette = { accent: "#17181c", fg: "#17181c", track: "#b9bcc6" };
const WHITE: Palette = { accent: "#ffffff", fg: "#ffffff", track: "#ffffff" };
const DARK_BG = "#0b0b0c";
const LIME = "#d4ff3a";

/** The mark's drawing in its 120x120 coordinate space (no <svg> wrapper). */
const markShapes = ({ accent, fg, track }: Palette): string =>
  [
    `<path d="M18 30 L48 60 L18 90" ${STROKE} stroke="${track}" stroke-width="16"/>`,
    `<path d="M58 30 L88 60 L58 90" ${STROKE} stroke="${accent}" stroke-width="16"/>`,
    `<circle cx="106" cy="60" r="8" fill="${fg}"/>`,
  ].join("\n  ");

/** The favicon's chevrons in a 120x120 tile (no <svg> wrapper, no tile). */
const faviconShapes = ({ accent, track }: Palette): string =>
  [
    `<path d="M22 26 L56 60 L22 94" ${STROKE} stroke="${track}" stroke-width="20"/>`,
    `<path d="M64 26 L98 60 L64 94" ${STROKE} stroke="${accent}" stroke-width="20"/>`,
  ].join("\n  ");

const svg = (viewBox: number, body: string): string =>
  `<svg ${XMLNS} viewBox="0 0 ${viewBox} ${viewBox}" width="${viewBox}" height="${viewBox}">\n  ${body}\n</svg>\n`;

const markSvg = (palette: Palette): string => svg(120, markShapes(palette));

const wordmarkSvg = (): string =>
  `<svg ${XMLNS} viewBox="0 0 360 120" width="360" height="120">
  ${markShapes(DARK)}
  <text x="138" y="60" dominant-baseline="central" font-family="Geist, system-ui, sans-serif" font-weight="600" font-size="88" letter-spacing="-0.04em" fill="${DARK.fg}">pace</text>
</svg>
`;

const faviconSvg = (): string =>
  svg(
    120,
    `<rect width="120" height="120" rx="30" fill="${LIME}"/>\n  ${faviconShapes({ accent: DARK_BG, fg: DARK_BG, track: "rgba(0,0,0,.3)" })}`,
  );

/** A 1024x1024 canvas with `shapes` (drawn in a 120 unit box) centred at `fraction` of the width. */
const canvas = (shapes: string, fraction: number, background?: string): string => {
  const scale = (1024 * fraction) / 120;
  const offset = (1024 - 120 * scale) / 2;
  const rect =
    background === undefined ? "" : `<rect width="1024" height="1024" fill="${background}"/>\n  `;
  return svg(
    1024,
    `${rect}<g transform="translate(${offset} ${offset}) scale(${scale})">\n  ${shapes}\n  </g>`,
  );
};

const FAVICON = faviconSvg();

export const LOGO_FILES: readonly LogoFile[] = [
  { path: "assets/logo/pace-mark.svg", svg: markSvg(DARK) },
  { path: "assets/logo/pace-mark-light.svg", svg: markSvg(LIGHT) },
  { path: "assets/logo/pace-wordmark.svg", svg: wordmarkSvg() },
  { path: "assets/logo/favicon.svg", svg: FAVICON },
  { path: "apps/web/public/favicon.svg", svg: FAVICON },
];

export const ICONS: readonly IconSpec[] = [
  // Web: the lime tile; the chevrons stay inside the central 80% (maskable-safe).
  { path: "apps/web/public/icon-192.png", size: 192, svg: FAVICON },
  { path: "apps/web/public/icon-512.png", size: 512, svg: FAVICON },
  { path: "apps/web/public/apple-touch-icon.png", size: 180, svg: FAVICON },
  // Expo: dark iOS icon, Android adaptive foreground (central 66% safe zone), themed mono.
  { path: "apps/app/assets/icon.png", size: 1024, svg: canvas(markShapes(DARK), 0.6, DARK_BG) },
  { path: "apps/app/assets/adaptive-icon.png", size: 1024, svg: canvas(markShapes(DARK), 0.56) },
  {
    path: "apps/app/assets/adaptive-icon-mono.png",
    size: 1024,
    svg: canvas(markShapes(WHITE), 0.56),
  },
  { path: "apps/app/assets/splash-icon.png", size: 1024, svg: canvas(markShapes(DARK), 0.5) },
  {
    path: "apps/app/assets/notification-icon.png",
    size: 96,
    svg: canvas(faviconShapes(WHITE), 0.9),
  },
];

export const renderPng = (source: string, width: number): Buffer =>
  new Resvg(source, { fitTo: { mode: "width", value: width } }).render().asPng();

/** Reads the IHDR chunk; the generated files are checked against their declared size. */
export const pngDimensions = (
  png: Buffer,
): { readonly height: number; readonly width: number } => ({
  height: png.readUInt32BE(20),
  width: png.readUInt32BE(16),
});

const writeFile = (root: string, relative: string, data: Buffer | string): void => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data);
};

const writeIcon = (root: string, icon: IconSpec): void => {
  const png = renderPng(icon.svg, icon.size);
  const { height, width } = pngDimensions(png);
  if (width !== icon.size || height !== icon.size) {
    console.error(`png: ${icon.path} rendered ${width}x${height}, expected ${icon.size}`);
    process.exit(1);
  }
  writeFile(root, icon.path, png);
  console.log(`png: ${icon.path} (${width}x${height})`);
};

const main = (): void => {
  const root = path.join(import.meta.dir, "..");
  for (const file of LOGO_FILES) {
    writeFile(root, file.path, file.svg);
    console.log(`svg: ${file.path}`);
  }
  for (const icon of ICONS) {
    writeIcon(root, icon);
  }
};

if (import.meta.main) {
  main();
}
