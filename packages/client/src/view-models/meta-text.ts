import { formatLate, formatSpan, type Language, plural, t } from "@pace/core";

import type { MetaPart } from "./now.ts";

/** Meta parts whose text needs no zone or color: everything but the dates and the importance. */
export type PlainMetaPart = Exclude<MetaPart, { readonly kind: "due" | "importance" | "starts" }>;

/** "6d 12h left", "15h late", "2 problems left", "4/7 solved" … */
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
