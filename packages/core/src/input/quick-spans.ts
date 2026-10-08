/** Where a recognised phrase sits in the typed text, and which chip it became. */
export type QuickSpanKind =
  | "due"
  | "estimate"
  | "importance"
  | "link"
  | "preset"
  | "project"
  | "subtasks"
  | "time";

export type QuickSpan = {
  readonly start: number;
  readonly end: number;
  readonly kind: QuickSpanKind;
};

export type Found = QuickSpan & { readonly match: RegExpExecArray };

export const findAll = (text: string, pattern: RegExp, kind: QuickSpanKind): readonly Found[] =>
  text
    .matchAll(pattern)
    .map((match) => ({ end: match.index + match[0].length, kind, match, start: match.index }))
    .toArray();

export const findFirst = (text: string, pattern: RegExp, kind: QuickSpanKind): Found | undefined =>
  findAll(text, pattern, kind)[0];

/** Blanks out recognised spans (same length) so later patterns do not read them again. */
export const mask = (text: string, spans: readonly QuickSpan[]): string =>
  spans.reduce(
    (current, span) =>
      current.slice(0, span.start) + " ".repeat(span.end - span.start) + current.slice(span.end),
    text,
  );

export const toSpan = (found: Found): QuickSpan => ({
  end: found.end,
  kind: found.kind,
  start: found.start,
});

/** Punctuation left dangling at the end once a phrase is cut out ("позвонить маме,"). */
const DANGLING = ",;:–—-";

const trimDangling = (text: string): string => {
  const last = text.at(-1);
  return last !== undefined && DANGLING.includes(last) ? trimDangling(text.slice(0, -1)) : text;
};

/** The text without the recognised spans: the user's own words, spaces tidied, nothing else. */
export const titleOf = (text: string, spans: readonly QuickSpan[]): string =>
  trimDangling(
    mask(text, spans)
      .split(/\s/u)
      .filter((word) => word !== "")
      .join(" ")
      .replaceAll(/ (?=[,.;:!?])/gu, "")
      .replace(/^[,.;:–—-]+/u, ""),
  ).trim();
