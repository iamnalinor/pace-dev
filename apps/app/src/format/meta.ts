import { type MetaPart, plainMetaText } from "@pace/client";
import { t } from "@pace/core";

import { type Viewer, zonedText } from "./time.ts";

/** Plain grey, emphasised (ASAP, Prioritized) or warning orange (late). */
export type MetaTone = "plain" | "strong" | "warn";

export type MetaText = { readonly text: string; readonly tone: MetaTone };

type ZonedPart = Extract<MetaPart, { readonly at: string; readonly tz: string }>;

/** The parts that print an instant in its zone: the due date, the final deadline, a later start. */
const isZoned = (part: MetaPart): part is ZonedPart => "at" in part;

const partText = (part: MetaPart, viewer: Viewer): string => {
  const { language } = viewer;
  if (part.kind === "importance") {
    return t(language, `importance.${part.importance}`);
  }
  if (isZoned(part)) {
    return t(language, `meta.${part.kind}`, {
      when: zonedText({ ...part, mode: "due" }, viewer),
    });
  }
  return plainMetaText(part, language);
};

const toneOf = (part: MetaPart): MetaTone => {
  if (part.kind === "late" || part.kind === "final-passed") {
    return "warn";
  }
  return part.kind === "importance" && part.importance !== "nice_to_have" ? "strong" : "plain";
};

/** The row's meta line, piece by piece, ready to join with " · ". */
export const metaTexts = (parts: readonly MetaPart[], viewer: Viewer): readonly MetaText[] =>
  parts.map((part) => ({ text: partText(part, viewer), tone: toneOf(part) }));
