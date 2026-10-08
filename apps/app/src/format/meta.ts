import { type MetaPart, plainMetaText } from "@pace/client";
import { type Language, plural, t } from "@pace/core";

import { type Viewer, zonedText } from "./time.ts";

/** Plain grey, emphasised (ASAP, Prioritized) or warning orange (late). */
export type MetaTone = "plain" | "strong" | "warn";

export type MetaText = { readonly text: string; readonly tone: MetaTone };

/** Message groups that carry the four CLDR forms. */
export type Countable = "meta.problemsLeft" | "projects.open" | "unit.days";

/** `count` with the form its language needs: "1 problem left", "осталось 3 задачи". */
export const countText = (language: Language, count: number, base: Countable): string =>
  plural(language, count, {
    one: t(language, `${base}.one`),
    other: t(language, `${base}.other`),
    few: t(language, `${base}.few`),
    many: t(language, `${base}.many`),
  });

const partText = (part: MetaPart, viewer: Viewer): string => {
  const { language } = viewer;
  if (part.kind === "importance") {
    return t(language, `importance.${part.importance}`);
  }
  return part.kind === "due"
    ? t(language, "meta.due", { when: zonedText({ ...part, mode: "due" }, viewer) })
    : plainMetaText(part, language);
};

const toneOf = (part: MetaPart): MetaTone => {
  if (part.kind === "late") {
    return "warn";
  }
  return part.kind === "importance" && part.importance !== "nice_to_have" ? "strong" : "plain";
};

/** The row's meta line, piece by piece, ready to join with " · ". */
export const metaTexts = (parts: readonly MetaPart[], viewer: Viewer): readonly MetaText[] =>
  parts.map((part) => ({ text: partText(part, viewer), tone: toneOf(part) }));
