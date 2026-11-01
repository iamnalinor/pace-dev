import type { ColorRole } from "./token-types.ts";

import { HUE_NAMES } from "./tokens.ts";

/**
How much contrast a pair needs: `text` WCAG 4.5 and APCA |Lc| 75 (body copy), `textSmall` WCAG 4.5
and |Lc| 50 (meta lines, captions, tags, button labels), `large` WCAG 3 and |Lc| 45 (large or
bold display text), `ui` WCAG 3 (boundaries, focus, marks, lines).
*/
export type ContrastTarget = "large" | "text" | "textSmall" | "ui";

/**
A foreground on a background as the system draws them. A translucent `bg` (a tint, a quiet fill)
is composited over `over` (default `bg.cell`) before measuring.
*/
export type ContrastPair = {
  readonly bg: ColorRole;
  readonly fg: ColorRole;
  readonly over?: ColorRole;
  readonly target: ContrastTarget;
};

const GROUNDS = ["bg.app", "bg.cell", "bg.elevated"] as const satisfies readonly ColorRole[];

const onGrounds = (fg: ColorRole, target: ContrastTarget): readonly ContrastPair[] =>
  GROUNDS.map((bg) => ({ bg, fg, target }));

/**
Every foreground/background pair the design uses (spec §3.1 and §3.9). The unit test measures each
in both themes against its target; add a pair here when a new combination enters the UI.
*/
export const USED_PAIRS: readonly ContrastPair[] = [
  ...onGrounds("label.primary", "text"),
  ...onGrounds("label.secondary", "textSmall"),
  ...onGrounds("label.tertiary", "textSmall"),
  ...onGrounds("accent.text", "textSmall"),
  ...onGrounds("status.danger", "textSmall"),
  ...onGrounds("status.warn", "textSmall"),
  ...onGrounds("status.question", "textSmall"),
  ...onGrounds("status.success", "textSmall"),
  ...onGrounds("outline", "ui"),
  ...onGrounds("focus", "ui"),
  { fg: "accent", bg: "bg.app", target: "ui" },
  { fg: "accent", bg: "bg.cell", target: "ui" },
  { fg: "accent.on", bg: "accent", target: "textSmall" },
  { fg: "accent.on", bg: "accent.pressed", target: "textSmall" },
  { fg: "accent.text", bg: "accentQuiet", over: "bg.cell", target: "textSmall" },
  { fg: "status.danger", bg: "dangerQuiet", over: "bg.cell", target: "textSmall" },
  { fg: "status.warn", bg: "warnQuiet", over: "bg.cell", target: "textSmall" },
  // A count badge: cell-coloured digits on the danger fill.
  { fg: "bg.cell", bg: "status.danger", target: "textSmall" },
  // The switch knob on its off track (the track is the outline colour).
  { fg: "bg.cell", bg: "outline", target: "ui" },
  ...HUE_NAMES.flatMap((name): readonly ContrastPair[] => [
    { fg: `hue.${name}.ink`, bg: `hue.${name}.tint`, over: "bg.cell", target: "textSmall" },
    { fg: `hue.${name}.ink`, bg: `hue.${name}.tint`, over: "bg.app", target: "textSmall" },
    { fg: `hue.${name}.stroke`, bg: "bg.app", target: "ui" },
    { fg: `hue.${name}.stroke`, bg: "bg.cell", target: "ui" },
  ]),
];
