import { type Language, t } from "@pace/core";

type OrdinalForm = "few" | "one" | "other" | "two";

const ordinalForm = (n: number, language: Language): OrdinalForm => {
  const rule = new Intl.PluralRules(language, { type: "ordinal" }).select(n);
  return rule === "one" || rule === "two" || rule === "few" ? rule : "other";
};

/** `2` → `2nd` / `2-я` ("the 2nd task on Now"). */
export const ordinal = (n: number, language: Language): string =>
  t(language, `ordinal.${ordinalForm(n, language)}`, { count: n });

/** `3, 4 and 5` / `3, 4 и 5`: problem numbers as people read them out. */
export const joinList = (items: readonly string[], language: Language): string => {
  const last = items.at(-1);
  return last === undefined || items.length === 1
    ? (last ?? "")
    : `${items.slice(0, -1).join(", ")} ${t(language, "common.and")} ${last}`;
};

const PERCENT = 100;

/** `0.654` → `65%`. */
export const percentText = (fraction: number): string => `${Math.round(fraction * PERCENT)}%`;
