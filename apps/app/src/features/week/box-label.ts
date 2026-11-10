/**
Roughly how wide a caption letter is, on the wide side: it decides only between wrapping and one
cut line, and a guess too narrow let «Домашка» (58 px) wrap into a 56 px box and stick out
(worst-case sweep). Cyrillic caption letters run 8–8.5 px.
*/
const CAPTION_LETTER_PX = 9;

/** The box's side padding (`px-1` on each side). */
const BOX_PADDING_PX = 8;

/** How a box shows its name: wrapped between words over the lines that fit, or one cut line. */
export type BoxLabelFit =
  | { readonly lines: number; readonly policy: "clamp" }
  | { readonly policy: "truncate" };

/**
How a Week box shows its name (spec §5.0.7, design review H6): it wraps between words only, never
inside one («Музы|ка»). While its longest word fits the box's measured width it wraps over the
lines its height holds; when a word cannot fit, the name is one line cut with an ellipsis («Музы…»),
whose whole value the tooltip and the details carry. Before the box is measured (`width` 0) it
wraps.
*/
export const boxLabelFit = (label: string, width: number, lines: number): BoxLabelFit => {
  const longest = Math.max(0, ...label.split(/\s+/u).map((word) => word.length));
  const room = width - BOX_PADDING_PX;
  return width > 0 && longest * CAPTION_LETTER_PX > room
    ? { policy: "truncate" }
    : { lines, policy: "clamp" };
};
