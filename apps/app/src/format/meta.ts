import { type MetaPart, plainMetaText } from "@pace/client";
import { t } from "@pace/core";

import { type Viewer, zonedText } from "./time.ts";

/** Plain grey, emphasised (ASAP, Prioritized) or warning orange (late). */
export type MetaTone = "plain" | "strong" | "warn";

export type MetaText = { readonly text: string; readonly tone: MetaTone };

const partText = (part: MetaPart, viewer: Viewer): string => {
  const { language } = viewer;
  if (part.kind === "importance") {
    return t(language, `importance.${part.importance}`);
  }
  if (part.kind === "due" || part.kind === "starts") {
    return t(language, part.kind === "due" ? "meta.due" : "meta.starts", {
      when: zonedText({ ...part, mode: "due" }, viewer),
    });
  }
  return plainMetaText(part, language);
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
