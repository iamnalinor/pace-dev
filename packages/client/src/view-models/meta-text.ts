import { formatSpan, type Language, plural, t } from "@pace/core";

import type { MetaPart } from "./now.ts";

/** Meta parts whose text needs no zone or color: everything but the due and the importance. */
export type PlainMetaPart = Exclude<MetaPart, { readonly kind: "due" | "importance" }>;

/** "6d 12h left", "15h 1m late", "2 problems left", "4/7 solved" … */
export const plainMetaText = (part: PlainMetaPart, language: Language): string => {
  switch (part.kind) {
    case "age":
    case "late":
    case "left": {
      return t(language, `meta.${part.kind}`, { span: formatSpan(part.minutes, language) });
    }
    case "behind-pace": {
      return t(language, "meta.behindPace", { percent: part.percent });
    }
    case "end-of-day": {
      return t(language, "meta.endOfDay");
    }
    case "problems-left": {
      return plural(language, part.count, {
        few: t(language, "meta.problemsLeft.few"),
        many: t(language, "meta.problemsLeft.many"),
        one: t(language, "meta.problemsLeft.one"),
        other: t(language, "meta.problemsLeft.other"),
      });
    }
    case "sent": {
      return t(language, "meta.sent", { count: part.submitted });
    }
    case "solved": {
      return t(language, "meta.solved", { solved: part.solved, total: part.total });
    }
  }
};
