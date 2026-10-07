import type { MetaPart } from "@pace/client";

import { formatDuration, type Language, plural, t } from "@pace/core";

import { type Viewer, zonedText } from "./time.ts";

/** Plain grey, emphasised (ASAP, Prioritized) or warning orange (late). */
export type MetaTone = "plain" | "strong" | "warn";

export type MetaText = { readonly text: string; readonly tone: MetaTone };

/** Message groups that carry the four CLDR forms. */
export type Countable =
  | "meta.age"
  | "meta.lateDays"
  | "meta.problemsLeft"
  | "projects.open"
  | "unit.days";

/** `count` with the form its language needs: "1 problem left", "осталось 3 задачи". */
export const countText = (language: Language, count: number, base: Countable): string =>
  plural(language, count, {
    one: t(language, `${base}.one`),
    other: t(language, `${base}.other`),
    few: t(language, `${base}.few`),
    many: t(language, `${base}.many`),
  });

const MINUTES_PER_DAY = 24 * 60;
/** From half a day on, lateness reads in whole days: "due last night" is "1 day late". */
const WHOLE_DAYS_FROM = MINUTES_PER_DAY / 2;

const lateText = (minutes: number, language: Language): string =>
  minutes >= WHOLE_DAYS_FROM
    ? countText(language, Math.ceil(minutes / MINUTES_PER_DAY), "meta.lateDays")
    : t(language, "meta.lateBy", { duration: formatDuration(minutes, language) });

const partText = (part: MetaPart, viewer: Viewer): string => {
  const { language } = viewer;
  switch (part.kind) {
    case "age": {
      return countText(language, part.days, "meta.age");
    }
    case "behind-pace": {
      return t(language, "meta.behindPace", { percent: part.percent });
    }
    case "due": {
      return t(language, "meta.due", { when: zonedText({ ...part, mode: "due" }, viewer) });
    }
    case "end-of-day": {
      return t(language, "meta.endOfDay");
    }
    case "importance": {
      return t(language, `importance.${part.importance}`);
    }
    case "late": {
      return lateText(part.minutes, language);
    }
    case "problems-left": {
      return countText(language, part.count, "meta.problemsLeft");
    }
    case "sent": {
      return t(language, "meta.sent", { count: part.submitted });
    }
    case "solved": {
      return t(language, "meta.solved", { solved: part.solved, total: part.total });
    }
  }
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
