import type { WhyRow } from "@pace/client";

import { countText } from "#app/format/meta.ts";
import { type Viewer, zonedText } from "#app/format/time.ts";
import { formatDuration, type Importance, t } from "@pace/core";

export type WhyLine = {
  /** Unique within the card: a key may show up both as an input and as a step. */
  readonly id: string;
  readonly label: string;
  readonly value: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}T/;
const MINUTES_PER_HOUR = 60;

const numberText = (value: number, viewer: Viewer): string =>
  new Intl.NumberFormat(viewer.language, { maximumFractionDigits: 2 }).format(value);

const valueText = (row: WhyRow, viewer: Viewer): string => {
  const { value } = row;
  if (value === null) {
    return "—";
  }
  if (typeof value === "string") {
    return ISO.test(value)
      ? zonedText({ at: value, mode: "datetime", tz: viewer.deviceTz }, viewer)
      : value;
  }
  switch (row.unit) {
    case "days": {
      return countText(viewer.language, Math.round(value), "unit.days");
    }
    case "hours": {
      return formatDuration(value * MINUTES_PER_HOUR, viewer.language);
    }
    case "percent": {
      return `${Math.round(value)}%`;
    }
    case "x": {
      return `${numberText(value, viewer)}×`;
    }
    case null: {
      return numberText(value, viewer);
    }
  }
};

/**
The "why it's Nth" card as label/value lines: units formatted, instants in the viewer's
zone, and the rank shown as "2 of 3" in one line (the category size has no line of its own).
*/
export const whyLines = (
  rows: readonly WhyRow[],
  importance: Importance,
  viewer: Viewer,
): readonly WhyLine[] => {
  const size = rows.find((row) => row.key === "rankSize")?.value;
  return rows
    .filter((row) => row.key !== "rankSize")
    .map((row, index) =>
      row.key === "rank"
        ? {
            id: `${row.key}:${index}`,
            label: t(viewer.language, "explain.rank", {
              importance: t(viewer.language, `importance.${importance}`),
            }),
            value: t(viewer.language, "explain.rankOf", {
              position: row.value ?? "",
              size: size ?? "",
            }),
          }
        : {
            id: `${row.key}:${index}`,
            label: t(viewer.language, `explain.${row.key}`),
            value: valueText(row, viewer),
          },
    );
};
