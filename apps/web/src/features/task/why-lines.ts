import type { WhyRow } from "@pace/client";

import { formatNumber, formatOrdinal, formatPercent } from "#web/shared/format/number.ts";
import { formatCount } from "#web/shared/format/plural.ts";
import { formatDateTime } from "#web/shared/format/time.ts";
import { formatDuration, type Importance, type Language, t } from "@pace/core";

export type WhyLine = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: "plain" | "warn";
};

type WhyContext = {
  readonly language: Language;
  /** The task's effective importance: the multiplier and the rank row are named after it. */
  readonly importance: Importance;
  readonly rank: null | { readonly position: number; readonly size: number };
  /** Where instants (an implicit due, a soft target) are read. */
  readonly tz: string;
};

const EMPTY = "—";
const PERCENT = 100;
const MINUTES_PER_HOUR = 60;

const numberValue = (row: WhyRow, value: number, context: WhyContext): string => {
  const { language } = context;
  switch (row.unit) {
    case "percent": {
      return formatPercent(value / PERCENT, language);
    }
    case "hours": {
      return formatDuration(value * MINUTES_PER_HOUR, language);
    }
    case "days": {
      return formatCount(language, Math.round(value * 10) / 10, "unit.days");
    }
    case "x": {
      return `× ${formatNumber(value, language)}`;
    }
    case null: {
      // The lag reads as a signed offset from the pace line.
      return row.key === "behindPace" && value > 0
        ? `+${formatNumber(value, language)}`
        : formatNumber(value, language);
    }
  }
};

const valueOf = (row: WhyRow, context: WhyContext): string => {
  if (row.value === null) {
    return EMPTY;
  }
  return typeof row.value === "string"
    ? formatDateTime(row.value, context.tz, context.language)
    : numberValue(row, row.value, context);
};

const labelOf = (row: WhyRow, context: WhyContext): string => {
  const { language } = context;
  const importance = t(language, `importance.${context.importance}`);
  switch (row.key) {
    case "multiplier": {
      return importance;
    }
    case "rank": {
      return t(language, "explain.rank", { importance });
    }
    default: {
      return t(language, `explain.${row.key}`);
    }
  }
};

const lineOf = (row: WhyRow, context: WhyContext): readonly WhyLine[] => {
  if (row.key === "rankSize") {
    return [];
  }
  if (row.key === "rank") {
    return context.rank === null
      ? []
      : [
          {
            key: row.key,
            label: labelOf(row, context),
            tone: "plain",
            value: t(context.language, "explain.rankOf", context.rank),
          },
        ];
  }
  const isBehind = row.key === "behindPace" && typeof row.value === "number" && row.value > 0;
  return [
    {
      key: row.key,
      label: labelOf(row, context),
      tone: isBehind ? "warn" : "plain",
      value: valueOf(row, context),
    },
  ];
};

/** The "why it's Nth" rows in words: the rank and the category size merge into "2 of 3". */
export const whyLines = (rows: readonly WhyRow[], context: WhyContext): readonly WhyLine[] =>
  rows.flatMap((row) => lineOf(row, context));

/** The card's title from the task's place on the board (`-1`: not on it right now). */
export const whyTitle = (index: number, language: Language): string => {
  if (index < 0) {
    return t(language, "task.whyHere");
  }
  return index === 0
    ? t(language, "task.whyTop")
    : t(language, "task.whyNth", { nth: formatOrdinal(index + 1, language) });
};
