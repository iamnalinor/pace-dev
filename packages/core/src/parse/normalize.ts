/**
The comparison form of text for evidence checks: lowercase, «ё» as «е», Latin and Cyrillic
lookalikes folded together, every dash one hyphen, whitespace collapsed. Only for
comparing; what is stored stays exactly as typed.
*/
const LOOKALIKES: Readonly<Record<string, string>> = {
  a: "а",
  c: "с",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  k: "к",
  m: "м",
  t: "т",
  h: "н",
  b: "в",
};

export const normalizeForEvidence = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll("ё", "е")
    .replaceAll(/[‐‑‒–—―−]/gu, "-")
    .replaceAll(/[abcehkmoptxy]/gu, (char) => LOOKALIKES[char] ?? char)
    .split(/\s/u)
    .filter((word) => word !== "")
    .join(" ");

/** Whether `quote` occurs in `source` once both are normalized. */
export const isQuotedFrom = (quote: string, source: string): boolean => {
  const needle = normalizeForEvidence(quote);
  return needle !== "" && normalizeForEvidence(source).includes(needle);
};

const tokens = (text: string): readonly string[] =>
  normalizeForEvidence(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== "");

/** A one-word quote must be a whole word of the source ("9" is not in "23:59"); longer ones a phrase. */
export const isWordFrom = (quote: string, source: string): boolean => {
  const words = tokens(quote);
  return words.length === 1 ? tokens(source).includes(words[0] ?? "") : isQuotedFrom(quote, source);
};
