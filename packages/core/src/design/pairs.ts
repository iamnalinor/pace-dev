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
is composited over `over` (default `bg.cell`) before measuring; `between` is a translucent layer
in between (a tag on a selected row: the tag's tint over the row's selection over the page).
*/
export type ContrastPair = {
  readonly bg: ColorRole;
  readonly between?: ColorRole;
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
The ground of a selected row that carries a meta line (`TaskRow`: Now, a project, History). The
whole meta line sits on it (tertiary times, danger words, every tag), so it is the lightest neutral
fill: on `fill.3` the tertiary meta and the green tag fall to 4.0-4.3:1 in light (bug-lessons 112).
`apps/app/src/shared/task-row.test.tsx` pins the row's class to it.
*/
export const SELECTED_ROW_FILL = "fill.1" satisfies ColorRole;

/**
Everything a selected row's meta line draws (its tags always have a hue: the project's, else the
category's, and the importance's), on the selection over the grounds a task list sits on: a cell
group, or the page (a list beside the inspector). No sheet or popover carries task rows.
*/
const SELECTED_ROW_PAIRS: readonly ContrastPair[] = (["bg.app", "bg.cell"] as const).flatMap(
  (over): readonly ContrastPair[] => [
    { bg: SELECTED_ROW_FILL, fg: "label.primary", over, target: "text" },
    { bg: SELECTED_ROW_FILL, fg: "label.secondary", over, target: "meta" },
    { bg: SELECTED_ROW_FILL, fg: "label.tertiary", over, target: "textSmall" },
    { bg: SELECTED_ROW_FILL, fg: "status.danger", over, target: "textSmall" },
    // The kit ListRow's selected bar: the cue that does not lean on the fill (F-COL-02).
    { bg: SELECTED_ROW_FILL, fg: "accent", over, target: "ui" },
    ...HUE_NAMES.map(
      (name): ContrastPair => ({
        bg: `hue.${name}.tint`,
        between: SELECTED_ROW_FILL,
        fg: `hue.${name}.ink`,
        over,
        target: "meta",
      }),
    ),
  ],
);

/**
Every foreground/background pair the design uses (spec §3.1 and §3.9). The unit test measures each
in both themes against its target; add a pair here when a new combination enters the UI.
*/
export const USED_PAIRS: readonly ContrastPair[] = [
  ...onGrounds("label.primary", "text", LABEL_GROUNDS),
  ...onGrounds("label.secondary", "meta", LABEL_GROUNDS),
  ...onGrounds("label.tertiary", "textSmall", LABEL_GROUNDS),
  ...onGrounds("accent.text", "meta", LABEL_GROUNDS),
  // Danger text is always weight 600 (the Urgent word, overdue times, errors), never body copy,
  // so the dark value (#FF8274, Lc 50-57) stays at the `textSmall` tier instead of `meta`.
  ...onGrounds("status.danger", "textSmall"),
  ...onGrounds("status.warn", "meta"),
  ...onGrounds("status.question", "meta"),
  ...onGrounds("status.success", "meta"),
  ...onGrounds("outline", "ui"),
  ...onGrounds("focus", "ui"),
  // The accent as a filled mark: a switch track that is on, a selected chip or day, the primary
  // button. Against each ground it is the "selected" cue (WCAG 1.4.11, spec §4.2.6 and §4.2.26).
  ...onGrounds("accent", "ui", LABEL_GROUNDS),
  // Text, an icon or a switch knob on the accent fill (a chosen chip or day, the primary button, a
  // switch that is on): measured as text, which is stricter than the 3:1 of a mark.
  { fg: "accent.on", bg: "accent", target: "textSmall" },
  { fg: "accent.on", bg: "accent.pressed", target: "textSmall" },
  { fg: "accent.text", bg: "accentQuiet", over: "bg.cell", target: "meta" },
  // The update strip across the top of the page: its words and its plain Refresh on the quiet accent.
  { fg: "label.primary", bg: "accentQuiet", over: "bg.app", target: "text" },
  { fg: "accent.text", bg: "accentQuiet", over: "bg.app", target: "meta" },
  { fg: "status.danger", bg: "dangerQuiet", over: "bg.cell", target: "textSmall" },
  { fg: "status.warn", bg: "warnQuiet", over: "bg.cell", target: "meta" },
  // A count badge: cell-coloured digits on the danger fill.
  { fg: "bg.cell", bg: "status.danger", target: "textSmall" },
  // A tag without a colour (`ColorTag` with no project colour): secondary on `fill.4`.
  ...GROUNDS.map(
    (over): ContrastPair => ({ bg: "fill.4", fg: "label.secondary", over, target: "meta" }),
  ),
  ...SELECTED_ROW_PAIRS,
  // The current destination (spec §4.2.22, §4.2.27): the sidebar's row and the rail's pill on the
  // sidebar ground, the tab bar's pill on the bar's cell; its name and icon in `label.primary`,
  // and the sidebar row's 4 px accent bar on the `fill.3` fill.
  ...(["bg.sidebar", "bg.cell"] as const).flatMap((over): readonly ContrastPair[] => [
    { bg: "fill.3", fg: "label.primary", over, target: "text" },
    { bg: "fill.3", fg: "accent", over, target: "ui" },
  ]),
  // A neutral count badge (unread notifications): secondary digits on `fill.3`.
  ...LABEL_GROUNDS.map(
    (over): ContrastPair => ({ bg: "fill.3", fg: "label.secondary", over, target: "meta" }),
  ),
  // The switch (spec §4.2.26), the knob inside its track so it never reaches the page: off, a
  // `label.tertiary` knob on the `fill.2` track (spec's `outline` knob measures 2.7-2.9:1 on it in
  // light) inside an `outline` ring; on, the `accent.on` knob on the `accent` track.
  ...LABEL_GROUNDS.map(
    (over): ContrastPair => ({ bg: "fill.2", fg: "label.tertiary", over, target: "ui" }),
  ),
  // A data bar on its `fill.4` track, on a card (Insights: "No project" is the slate stroke,
  // never `label.quaternary`, which is the disabled role).
  ...(["bg.cell", "bg.elevated"] as const).map(
    (over): ContrastPair => ({ bg: "fill.4", fg: "hue.slate.stroke", over, target: "ui" }),
  ),
  // The kit's controls (Task 3.9; bug-lessons 123: every mark a control draws is measured, not
  // only its text). A chip, a segment and a secondary button rest on `fill.2`: their labels.
  ...LABEL_GROUNDS.flatMap((over): readonly ContrastPair[] => [
    { bg: "fill.2", fg: "label.secondary", over, target: "meta" },
    { bg: "fill.2", fg: "label.primary", over, target: "text" },
  ]),
  // The chosen segment's thumb: `bg.elevated` on the `fill.2` track measures 1.05-1.15:1 and
  // `outline` 2.5-2.9:1 in light, so its edge is a `label.tertiary` hairline (the switch's off knob
  // pair above), with the label's weight as the second cue.
  // A checked circle at rest: the `bg.app` check on the `label.secondary` disc.
  { bg: "label.secondary", fg: "bg.app", target: "ui" },
  // The slider's and a task's progress fill (`label.primary`) on the `fill.4` track.
  ...GROUNDS.map(
    (over): ContrastPair => ({ bg: "fill.4", fg: "label.primary", over, target: "ui" }),
  ),
  // The slider's thumb (`label.primary`) inside its `bg.cell` ring, on the page.
  ...GROUNDS.map((bg): ContrastPair => ({ bg, fg: "label.primary", target: "ui" })),
  ...HUE_NAMES.flatMap((name): readonly ContrastPair[] => [
    { fg: `hue.${name}.ink`, bg: `hue.${name}.tint`, over: "bg.cell", target: "meta" },
    { fg: `hue.${name}.ink`, bg: `hue.${name}.tint`, over: "bg.app", target: "meta" },
    // Also Day's rail bar (design review H4): its 2 px stroke edge on the page is the bar's 3:1
    // mark; its tint alone measured 1.15:1 light and 1.32:1 dark (on its own tint the stroke
    // measures 2.9:1 for green and teal, so the edge, not the fill, carries it).
    { fg: `hue.${name}.stroke`, bg: "bg.app", target: "ui" },
    // Also a running time-bar tile's bar: the tile is `bg.cell`, since the stroke on `fill.3`
    // (the spec's running fill) measures 2.7-2.97:1 and on `fill.2` 2.94:1 (design review H5).
    { fg: `hue.${name}.stroke`, bg: "bg.cell", target: "ui" },
  ]),
];
