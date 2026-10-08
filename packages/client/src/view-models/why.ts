import type { ExplainKey, Explanation } from "@pace/core";

/** One line of the "why it's Nth" card; the UI translates the key and formats by unit. */
export type WhyRow = {
  readonly key: ExplainKey;
  readonly value: Explanation["inputs"][number]["value"];
  readonly unit: Explanation["inputs"][number]["unit"] | null;
};

export type WhyGroupName = "importance" | "result" | "time" | "work";

/** Rows set apart by what they are about, so the table reads in four short blocks. */
export type WhyGroup = { readonly name: WhyGroupName; readonly rows: readonly WhyRow[] };

/** The formula with every letter replaced by its value: text runs and values, in order. */
export type FormulaPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "value"; readonly row: WhyRow };

export type WhyModel = {
  readonly policy: Explanation["policy"];
  readonly groups: readonly WhyGroup[];
  readonly formula: readonly FormulaPart[];
};

const GROUP_OF: Readonly<Record<ExplainKey, WhyGroupName>> = {
  ageDays: "time",
  behindPace: "work",
  daysAfterSoftTarget: "time",
  finalAt: "time",
  finalPassed: "time",
  hoursLeft: "time",
  implicitDue: "time",
  implicitUrgency: "result",
  multiplier: "importance",
  progress: "work",
  rank: "importance",
  rankBonus: "importance",
  rankSize: "importance",
  score: "result",
  softTarget: "time",
  urgency: "result",
  urgencyAtSoftTarget: "result",
  waitingSince: "time",
  windowElapsed: "work",
  workLeft: "work",
};

const GROUP_ORDER: readonly WhyGroupName[] = ["work", "time", "importance", "result"];

/** Neighbouring text runs as one run; formulas are a few dozen pieces, so recursion is fine. */
const joinTexts = (parts: readonly FormulaPart[]): readonly FormulaPart[] => {
  const [first, second, ...rest] = parts;
  if (first === undefined || second === undefined) {
    return parts;
  }
  return first.kind === "text" && second.kind === "text"
    ? joinTexts([{ kind: "text", text: first.text + second.text }, ...rest])
    : [first, ...joinTexts([second, ...rest])];
};

/** `0.25 + W / max(h, 0.5)` with W and h swapped for their rows; `= urgency` when it is the result. */
const formulaParts = (
  explanation: Explanation,
  rows: readonly WhyRow[],
): readonly FormulaPart[] => {
  const bySymbol = new Map(
    explanation.legend.flatMap(({ key, symbol }) => {
      const row = rows.find((candidate) => candidate.key === key);
      return row === undefined ? [] : [[symbol, row] as const];
    }),
  );
  // Words and the runs between them; a word that is a legend letter becomes its value.
  const parts = joinTexts(
    explanation.formula
      .split(/(\w+)/u)
      .filter((piece) => piece !== "")
      .map((piece): FormulaPart => {
        const row = bySymbol.get(piece);
        return row === undefined ? { kind: "text", text: piece } : { kind: "value", row };
      }),
  );
  const urgency = rows.find((row) => row.key === "urgency");
  const isDecidedElsewhere = rows.some((row) => row.key === "implicitUrgency");
  return urgency === undefined || isDecidedElsewhere
    ? parts
    : [...parts, { kind: "text", text: " = " }, { kind: "value", row: urgency }];
};

/** The card's model: grouped rows and the formula filled in. */
export const whyModel = (explanation: Explanation): WhyModel => {
  const rows: readonly WhyRow[] = [
    ...explanation.inputs.map((row) => ({
      key: row.key,
      unit: row.unit ?? null,
      value: row.value,
    })),
    ...explanation.steps.map((row) => ({ key: row.key, unit: null, value: row.value })),
  ];
  return {
    policy: explanation.policy,
    groups: GROUP_ORDER.map((name) => ({
      name,
      rows: rows.filter((row) => GROUP_OF[row.key] === name),
    })).filter((group) => group.rows.length > 0),
    formula: formulaParts(explanation, rows),
  };
};
