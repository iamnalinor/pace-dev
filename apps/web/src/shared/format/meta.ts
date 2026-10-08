import { type MetaPart, plainMetaText } from "@pace/client";
import { type Importance, IMPORTANCE_COLORS, type ProjectColorName, t } from "@pace/core";

import { formatDue, type Viewer } from "./time.ts";

/** How a piece of the meta line is drawn: stressed (ASAP), a warning (late) or quiet. */
export type MetaTone = "plain" | "strong" | "warn";

export type MetaSegment = {
  readonly text: string;
  readonly tone: MetaTone;
  /** Drawn as a tag in this color (the importance's). */
  readonly color?: ProjectColorName | undefined;
};

const segment = (text: string, tone: MetaTone = "plain"): MetaSegment => ({ text, tone });

/** The importance as a tag in its color: coral ASAP, amber Prioritized, slate Nice-to-have. */
const importanceSegment = (importance: Importance, { language }: Viewer): MetaSegment => ({
  color: IMPORTANCE_COLORS[importance] ?? undefined,
  text: t(language, `importance.${importance}`),
  tone: importance === "nice_to_have" ? "plain" : "strong",
});

const formatPart = (part: MetaPart, viewer: Viewer): MetaSegment => {
  if (part.kind === "importance") {
    return importanceSegment(part.importance, viewer);
  }
  if (part.kind === "late") {
    return segment(plainMetaText(part, viewer.language), "warn");
  }
  return segment(
    part.kind === "due" ? formatDue(part, viewer) : plainMetaText(part, viewer.language),
  );
};

/** A Now row's meta line (`Due tomorrow 23:59 · 4/7 solved · 2 sent`) as styled segments. */
export const formatMeta = (parts: readonly MetaPart[], viewer: Viewer): readonly MetaSegment[] =>
  parts.map((part) => formatPart(part, viewer));
