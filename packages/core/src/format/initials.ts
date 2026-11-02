import type { Language } from "../i18n/language.ts";

/**
The patterns need Unicode property escapes. They are built on first use, never at module load: an
engine that rejects `\p{…}` would otherwise take the whole `@pace/core` import down with it. A
pattern the engine refuses reads as `null` and the caller falls back to plain code-point rules.
*/
/* eslint-disable prefer-regex-literals, security/detect-non-literal-regexp -- the sources are literal strings built inside thunks so that a refusal throws at first use, not at module load. */
const PATTERNS = {
  // One cluster for a platform without `Intl.Segmenter` (Hermes): a flag's two regional indicators
  // or one code point, then the marks, skin tones, tag characters and variation selectors that
  // extend it, and what a zero-width joiner joins to it. Enough for names.

  cluster: () =>
    new RegExp(
      String.raw`(?:\p{Regional_Indicator}\p{Regional_Indicator}|[\s\S])(?:[\p{M}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]|\u{200D}[\s\S])*`,
      "gu",
    ),
  letter: () => new RegExp(String.raw`^\p{L}`, "u"),
  pictograph: () => new RegExp(String.raw`^\p{Extended_Pictographic}|^\p{Regional_Indicator}`, "u"),
} as const;
/* eslint-enable prefer-regex-literals, security/detect-non-literal-regexp -- end of the patterns built on first use */

const compiled = new Map<keyof typeof PATTERNS, null | RegExp>();

const pattern = (name: keyof typeof PATTERNS): null | RegExp => {
  if (!compiled.has(name)) {
    try {
      // eslint-disable-next-line functional/immutable-data -- memo of patterns built on first use
      compiled.set(name, PATTERNS[name]());
    } catch {
      // eslint-disable-next-line functional/immutable-data -- memo: this engine refuses the pattern
      compiled.set(name, null);
    }
  }
  return compiled.get(name) ?? null;
};

/** Text as user-perceived characters, never cutting an emoji or a letter from its marks. */
export const splitGraphemes = (text: string): string[] => {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(
      ({ segment }) => segment,
    );
  }
  const cluster = pattern("cluster");
  return cluster === null
    ? Array.from(text.matchAll(/[\s\S]/gu), (point) => point[0])
    : Array.from(text.matchAll(cluster), (found) => found[0]);
};

/** From U+1F000 on lie the emoji planes (the fallback's idea of a pictograph). */
const FIRST_EMOJI_PLANE_POINT = 0x1_f0_00;

const isPictograph = (grapheme: string): boolean =>
  pattern("pictograph")?.test(grapheme) ??
  (grapheme.codePointAt(0) ?? 0) >= FIRST_EMOJI_PLANE_POINT;

/** A letter by property; without property escapes, a character that has two cases. */
const isLetter = (grapheme: string): boolean =>
  pattern("letter")?.test(grapheme) ?? grapheme.toLowerCase() !== grapheme.toUpperCase();

/**
The letters an avatar shows for a name: the first grapheme of the first two space-separated words,
upper-cased (`Albert Nalinor` → `AN`). Upper-casing can lengthen a letter (`ß` → `SS`), so only the
first grapheme of the upper-cased letter is kept: `ß a` → `SA`, never more than two graphemes. A
name that starts with an emoji shows that emoji alone (`🦊 Альберт` → `🦊`). Words that do not start
with a letter are skipped; `""` means there is nothing to show and the caller draws the person
icon. `language` picks the case mapping (Turkish `i` → `İ`). Text is cut by grapheme, never by
UTF-16 unit (`slice(0, 1)` leaves half an emoji, a lone surrogate).
*/
export const initials = (name: string, language?: Language): string => {
  const firsts = name
    .split(/\s+/u)
    .map((word) => splitGraphemes(word)[0] ?? "")
    .filter((grapheme) => grapheme !== "");
  const [lead] = firsts;
  return lead !== undefined && isPictograph(lead)
    ? lead
    : firsts
        .filter((grapheme) => isLetter(grapheme))
        .slice(0, 2)
        .map((grapheme) => splitGraphemes(grapheme.toLocaleUpperCase(language))[0] ?? "")
        .join("");
};

/** The text with its first grapheme upper-cased for the language (`октябрь` → `Октябрь`). */
export const capitalize = (text: string, language: string): string => {
  const [first = "", ...rest] = splitGraphemes(text);
  return `${first.toLocaleUpperCase(language)}${rest.join("")}`;
};
