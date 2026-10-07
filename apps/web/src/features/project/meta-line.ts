import type { MetaPart } from "@pace/client";

import { formatAge, formatLate } from "#web/shared/format/duration.ts";
import { formatCount } from "#web/shared/format/plural.ts";
import { formatDue, type Viewer } from "#web/shared/format/time.ts";
import { t } from "@pace/core";

/** A piece of a row's meta line and how loud it is: importance stands out, lateness warns. */
export type MetaPiece = { readonly text: string; readonly tone: "plain" | "strong" | "warn" };

const piece = (part: MetaPart, viewer: Viewer): MetaPiece => {
  const { language } = viewer;
  switch (part.kind) {
    case "age": {
      return { text: formatAge(part.days, language), tone: "plain" };
    }
    case "behind-pace": {
      return { text: t(language, "meta.behindPace", { percent: part.percent }), tone: "plain" };
    }
    case "due": {
      return { text: formatDue(part, viewer), tone: "plain" };
    }
    case "end-of-day": {
      return { text: t(language, "meta.endOfDay"), tone: "plain" };
    }
    case "importance": {
      return { text: t(language, `importance.${part.importance}`), tone: "strong" };
    }
    case "late": {
      return { text: formatLate(part.minutes, language), tone: "warn" };
    }
    case "problems-left": {
      return { text: formatCount(language, part.count, "meta.problemsLeft"), tone: "plain" };
    }
    case "sent": {
      return { text: t(language, "meta.sent", { count: part.submitted }), tone: "plain" };
    }
    case "solved": {
      return { text: t(language, "meta.solved", part), tone: "plain" };
    }
  }
};

/** The row's meta parts in the viewer's language, in the order the view-model gives them. */
export const metaPieces = (meta: readonly MetaPart[], viewer: Viewer): readonly MetaPiece[] =>
  meta.map((part) => piece(part, viewer));
