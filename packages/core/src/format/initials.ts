import type { Language } from "../i18n/language.ts";

import { isLetter, isPictograph, splitGraphemes } from "./graphemes.ts";

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
