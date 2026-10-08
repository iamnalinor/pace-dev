import { type Language, plural, t } from "@pace/core";

/** Message groups that carry the four CLDR forms (`.one`, `.few`, `.many`, `.other`). */
export type PluralBase = "meta.problemsLeft" | "unit.days";

/** `count` in the form the language needs: "1 problem left", "осталось 3 задачи". */
export const formatCount = (language: Language, count: number, base: PluralBase): string =>
  plural(language, count, {
    few: t(language, `${base}.few`),
    many: t(language, `${base}.many`),
    one: t(language, `${base}.one`),
    other: t(language, `${base}.other`),
  });
