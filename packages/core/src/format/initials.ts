/**
One cluster for a platform without `Intl.Segmenter` (Hermes): a flag's two regional indicators or
one code point, then the marks, skin tones, tag characters and variation selectors that extend it,
and what a zero-width joiner joins to it. Enough for names; the platform segmenter is used
wherever it exists.
*/
const CLUSTER =
  // eslint-disable-next-line security/detect-unsafe-regex -- one star over two alternatives that start with different characters: linear, nothing to backtrack into.
  /(?:\p{Regional_Indicator}\p{Regional_Indicator}|[\s\S])(?:[\p{M}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]|\u{200D}[\s\S])*/gu;

/** Text as user-perceived characters, never cutting an emoji or a letter from its marks. */
export const splitGraphemes = (text: string): string[] =>
  typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(
        ({ segment }) => segment,
      )
    : (text.match(CLUSTER) ?? []);

const PICTOGRAPH = /^\p{Extended_Pictographic}|^\p{Regional_Indicator}/u;
const LETTER = /^\p{L}/u;

/**
The letters an avatar shows for a name: the first grapheme of the first two space-separated words,
upper-cased (`Albert Nalinor` → `AN`). A name that starts with an emoji shows that emoji alone
(`🦊 Альберт` → `🦊`). Words that do not start with a letter are skipped; `""` means there is
nothing to show and the caller draws the person icon. Text is cut by grapheme, never by UTF-16 unit
(`slice(0, 1)` leaves half an emoji, a lone surrogate).
*/
export const initials = (name: string): string => {
  const firsts = name
    .split(/\s+/u)
    .map((word) => splitGraphemes(word)[0] ?? "")
    .filter((grapheme) => grapheme !== "");
  const [lead] = firsts;
  return lead !== undefined && PICTOGRAPH.test(lead)
    ? lead
    : firsts
        .filter((grapheme) => LETTER.test(grapheme))
        .slice(0, 2)
        .map((grapheme) => grapheme.toLocaleUpperCase())
        .join("");
};

/** The text with its first grapheme upper-cased for the language (`октябрь` → `Октябрь`). */
export const capitalize = (text: string, language: string): string => {
  const [first = "", ...rest] = splitGraphemes(text);
  return `${first.toLocaleUpperCase(language)}${rest.join("")}`;
};
