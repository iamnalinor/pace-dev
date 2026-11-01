import type { ColorRole } from "./token-types.ts";

import { HUE_NAMES } from "./tokens.ts";

/**
How much contrast a pair needs: `text` WCAG 4.5 and APCA |Lc| 75 (body copy), `meta` WCAG 4.5 and
|Lc| 60 (meta lines, captions, tags, links, status words), `textSmall` WCAG 4.5 and |Lc| 50
(`label.tertiary` and weight-600 danger text only), `large` WCAG 3 and |Lc| 45 (large or bold
display text), `ui` WCAG 3 (boundaries, focus, marks, lines).
*/
export type ContrastTarget = "large" | "meta" | "text" | "textSmall" | "ui";

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

/** Labels also sit on the sidebar and on inset fields. */
const LABEL_GROUNDS = [
  ...GROUNDS,
  "bg.inset",
  "bg.sidebar",
] as const satisfies readonly ColorRole[];

const onGrounds = (
  fg: ColorRole,
  target: ContrastTarget,
  grounds: readonly ColorRole[] = GROUNDS,
): readonly ContrastPair[] => grounds.map((bg) => ({ bg, fg, target }));

/**
Every foreground/background pair the design uses (spec §3.1 and §3.9). The unit test measures each
in both themes against its target; add a pair here when a new combination enters the UI.
*/
export const USED_PAIRS: readonly ContrastPair[] = [
  ...onGrounds("label.primary", "text", LABEL_GROUNDS),
  ...onGrounds("label.secondary", "meta", LABEL_GROUNDS),
  ...onGrounds("label.tertiary", "textSmall", LABEL_GROUNDS),
  ...onGrounds("accent.text", "meta"),
  // Danger text is always weight 600 (the Urgent word, overdue times, errors), never body copy,
  // so the dark value (#FF8274, Lc 50-57) stays at the `textSmall` tier instead of `meta`.
  ...onGrounds("status.danger", "textSmall"),
  ...onGrounds("status.warn", "meta"),
  ...onGrounds("status.question", "meta"),
  ...onGrounds("status.success", "meta"),
  ...onGrounds("outline", "ui"),
  ...onGrounds("focus", "ui"),
  { fg: "accent", bg: "bg.app", target: "ui" },
  { fg: "accent", bg: "bg.cell", target: "ui" },
  { fg: "accent.on", bg: "accent", target: "textSmall" },
  { fg: "accent.on", bg: "accent.pressed", target: "textSmall" },
  { fg: "accent.text", bg: "accentQuiet", over: "bg.cell", target: "meta" },
  { fg: "status.danger", bg: "dangerQuiet", over: "bg.cell", target: "textSmall" },
  { fg: "status.warn", bg: "warnQuiet", over: "bg.cell", target: "meta" },
  // A count badge: cell-coloured digits on the danger fill.
  { fg: "bg.cell", bg: "status.danger", target: "textSmall" },
  // The switch knob on its off track (the track is the outline colour).
  { fg: "bg.cell", bg: "outline", target: "ui" },
  ...HUE_NAMES.flatMap((name): readonly ContrastPair[] => [
    { fg: `hue.${name}.ink`, bg: `hue.${name}.tint`, over: "bg.cell", target: "meta" },
    { fg: `hue.${name}.ink`, bg: `hue.${name}.tint`, over: "bg.app", target: "meta" },
    { fg: `hue.${name}.stroke`, bg: "bg.app", target: "ui" },
    { fg: `hue.${name}.stroke`, bg: "bg.cell", target: "ui" },
  ]),
];
