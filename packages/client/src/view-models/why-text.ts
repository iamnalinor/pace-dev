import { formatSpan, type Importance, type Language, t } from "@pace/core";

import type { WhyGroupName, WhyModel, WhyRow } from "./why.ts";

export type WhyLine = {
  /** Unique within the card: a key may show up both as an input and as a step. */
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly tone: "plain" | "total" | "warn";
};

export type WhyTextGroup = {
  readonly name: WhyGroupName;
  readonly title: string;
  readonly lines: readonly WhyLine[];
};

/** A piece of the filled-in formula; values are drawn apart (accent, mono) from the operators. */
export type FormulaRun = { readonly id: string; readonly text: string; readonly isValue: boolean };

export type WhyText = {
  readonly groups: readonly WhyTextGroup[];
  readonly formula: readonly FormulaRun[];
};

export type WhyTextContext = {
  readonly language: Language;
  /** The task's effective importance: the multiplier and the rank are named after it. */
  readonly importance: Importance;
  readonly rank: null | { readonly position: number; readonly size: number };
  /** How an instant (an implicit due, a soft target) reads: zone handling is the UI's. */
  readonly instant: (iso: string) => string;
};

const EMPTY = "—";
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

const numberText = (value: number, language: Language): string =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);

/** Behind the pace line by at least what two decimals can show: a lag of 0.0001 reads as none. */
const isBehind = (row: WhyRow): boolean =>
  row.key === "behindPace" && typeof row.value === "number" && Math.round(row.value * 100) > 0;

const numberValue = (row: WhyRow, value: number, language: Language): string => {
  switch (row.unit) {
    case "percent": {
      return `${String(Math.round(value))}%`;
    }
    case "hours": {
      return formatSpan(value * MINUTES_PER_HOUR, language);
    }
    case "days": {
      return formatSpan(value * MINUTES_PER_DAY, language);
    }
    case "x": {
      return `× ${numberText(value, language)}`;
    }
    case null:
    case undefined: {
      // The lag reads as a signed offset from the pace line.
      return isBehind(row) ? `+${numberText(value, language)}` : numberText(value, language);
    }
  }
};

/** A row's value in words and units. */
export const whyValueText = (row: WhyRow, context: WhyTextContext): string => {
  if (row.value === null) {
    return EMPTY;
  }
  return typeof row.value === "string"
    ? context.instant(row.value)
    : numberValue(row, row.value, context.language);
};

const labelOf = (row: WhyRow, { importance, language }: WhyTextContext): string => {
  const importanceName = t(language, `importance.${importance}`);
  if (row.key === "multiplier") {
    return importanceName;
  }
  return row.key === "rank"
    ? t(language, "explain.rank", { importance: importanceName })
    : t(language, `explain.${row.key}`);
};

const toneOf = (row: WhyRow): WhyLine["tone"] => {
  if (row.key === "score") {
    return "total";
  }
  return isBehind(row) ? "warn" : "plain";
};

const lineOf = (row: WhyRow, index: number, context: WhyTextContext): readonly WhyLine[] => {
  const id = `${row.key}:${String(index)}`;
  if (row.key === "rankSize") {
    return [];
  }
  if (row.key === "rank") {
    return context.rank === null
      ? []
      : [
          {
            id,
            label: labelOf(row, context),
            tone: "plain",
            value: t(context.language, "explain.rankOf", context.rank),
          },
        ];
  }
  return [
    { id, label: labelOf(row, context), tone: toneOf(row), value: whyValueText(row, context) },
  ];
};

/**
The "why it's Nth" card in words: four titled blocks (the rank and the category size merge
into "2 of 3"), and the formula with every letter replaced by its value.
*/
export const whyText = (model: WhyModel, context: WhyTextContext): WhyText => ({
  groups: model.groups.map((group) => ({
    name: group.name,
    title: t(context.language, `why.group.${group.name}`),
    lines: group.rows.flatMap((row, index) => lineOf(row, index, context)),
  })),
  formula: model.formula.map((part, index) =>
    part.kind === "text"
      ? { id: String(index), isValue: false, text: part.text }
      : { id: String(index), isValue: true, text: whyValueText(part.row, context) },
  ),
});
