/**
Cutting text to a limit without breaking a character: by UTF-16 units for a stored field
(`sliceWhole`, what a schema's `.max()` counts), by graphemes for what is shown (`clipText`,
`clipWords`).
*/
import { splitGraphemes } from "./graphemes.ts";

const fitGraphemes = (text: string, units: number): string =>
  // eslint-disable-next-line unicorn/no-array-reduce -- one pass that stops adding at the first character that does not fit
  splitGraphemes(text).reduce<{ readonly isFull: boolean; readonly kept: string }>(
    (state, grapheme) =>
      state.isFull || state.kept.length + grapheme.length > units
        ? { isFull: true, kept: state.kept }
        : { isFull: false, kept: state.kept + grapheme },
    { isFull: false, kept: "" },
  ).kept;

/**
The longest start of `text` that fits in `units` UTF-16 code units (what a stored field's length
counts) and ends between two characters: a cut never leaves half of an emoji.
*/
export const sliceWhole = (text: string, units: number): string =>
  text.length <= units ? text : fitGraphemes(text, units);

/**
A text cut to at most `max` graphemes, its end replaced by `…` when it was longer: a value from
data quoted in a sentence (a task title in a toast) without the sentence ever being cut.
*/
export const clipText = (text: string, max: number): string => {
  const graphemes = splitGraphemes(text);
  if (graphemes.length <= Math.max(1, max)) {
    return text;
  }
  // A limit below one still says that something was cut; no space is left before the ellipsis.
  const kept = graphemes.slice(0, Math.max(0, max - 1)).join("");
  return `${kept.trimEnd()}…`;
};

/**
`clipText` for a sentence: cut at the last word boundary within `max` graphemes (a word is never
split unless it alone is longer than the limit), its end replaced by `…`.
*/
export const clipWords = (text: string, max: number): string => {
  const clipped = clipText(text, max);
  if (clipped === text) {
    return text;
  }
  const kept = clipped.slice(0, -1);
  // The cut fell between two words already: the last kept word is whole.
  const next = splitGraphemes(text)[splitGraphemes(kept).length] ?? "";
  if (/^\s/u.test(next)) {
    return `${kept.trimEnd()}…`;
  }
  const boundary = kept.search(/\s\S*$/u);
  return boundary > 0 ? `${kept.slice(0, boundary).trimEnd()}…` : clipped;
};
