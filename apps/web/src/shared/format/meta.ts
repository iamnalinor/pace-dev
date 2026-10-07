import type { MetaPart } from "@pace/client";

import { type Importance, t } from "@pace/core";

import { formatAge, formatLate } from "./duration.ts";
import { formatCount } from "./plural.ts";
import { formatDue, type Viewer } from "./time.ts";

/** How a piece of the meta line is drawn: stressed (ASAP), a warning (late) or quiet. */
export type MetaTone = "plain" | "strong" | "warn";

export type MetaSegment = { readonly text: string; readonly tone: MetaTone };

const segment = (text: string, tone: MetaTone = "plain"): MetaSegment => ({ text, tone });

/** A quiet Nice-to-have stays quiet; the two urgent categories stand out. */
const importanceSegment = (importance: Importance, { language }: Viewer): MetaSegment =>
  segment(
    t(language, `importance.${importance}`),
    importance === "nice_to_have" ? "plain" : "strong",
  );

const formatPart = (part: MetaPart, viewer: Viewer): MetaSegment => {
  const { language } = viewer;
  switch (part.kind) {
    case "age": {
      return segment(formatAge(part.days, language));
    }
    case "behind-pace": {
      return segment(t(language, "meta.behindPace", { percent: part.percent }));
    }
    case "due": {
      return segment(formatDue(part, viewer));
    }
    case "end-of-day": {
      return segment(t(language, "meta.endOfDay"));
    }
    case "importance": {
      return importanceSegment(part.importance, viewer);
    }
    case "late": {
      return segment(formatLate(part.minutes, language), "warn");
    }
    case "problems-left": {
      return segment(formatCount(language, part.count, "meta.problemsLeft"));
    }
    case "sent": {
      return segment(t(language, "meta.sent", { count: part.submitted }));
    }
    case "solved": {
      return segment(t(language, "meta.solved", { solved: part.solved, total: part.total }));
    }
  }
};

/** A Now row's meta line (`Due tomorrow 23:59 · 4/7 solved · 2 sent`) as styled segments. */
export const formatMeta = (parts: readonly MetaPart[], viewer: Viewer): readonly MetaSegment[] =>
  parts.map((part) => formatPart(part, viewer));
