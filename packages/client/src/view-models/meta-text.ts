import { formatLate, formatSpan, type Language, plural, t } from "@pace/core";

import type { MetaPart } from "./now.ts";

/** Meta parts whose text needs no zone or color: everything but the dates and the importance. */
export type PlainMetaPart = Exclude<MetaPart, { readonly kind: "due" | "importance" | "starts" }>;

/** "6d 12h left", "15h late", "2 subtasks left", "4/7 solved" … */
export const plainMetaText = (part: PlainMetaPart, language: Language): string => {
  switch (part.kind) {
    case "age": {
      return part.minutes < 1
        ? t(language, "meta.ageNew")
        : t(language, "meta.age", { span: formatSpan(part.minutes, language) });
    }
    case "left": {
      return t(language, `meta.${part.kind}`, { span: formatSpan(part.minutes, language) });
    }
    case "paused": {
      return t(language, "status.paused");
    }
    case "late": {
      return t(language, "meta.late", {
        span: formatLate(part.minutes, language, part.isSoft),
      });
    }
    case "subtasks-left": {
      return plural(language, part.count, {
        few: t(language, "meta.subtasksLeft.few"),
        many: t(language, "meta.subtasksLeft.many"),
        one: t(language, "meta.subtasksLeft.one"),
        other: t(language, "meta.subtasksLeft.other"),
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
