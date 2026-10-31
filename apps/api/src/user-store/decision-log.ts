import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { and, desc, eq, gte, isNull, like, lte, or, type SQL } from "drizzle-orm";

import { newId } from "@pace/core";

import type {
  DecisionAnswer,
  DecisionEntry,
  DecisionQuery,
  DecisionRecord,
  JsonValue,
} from "../shared/contract.ts";

import * as schema from "./schema.ts";

type Db = DrizzleSqliteDODatabase<typeof schema>;

const toDecision = (row: typeof schema.decisions.$inferSelect): DecisionRecord => ({
  ...row,
  inputs: JSON.parse(row.inputs) as JsonValue,
});

const textFilter = (q: string): SQL =>
  or(
    like(schema.decisions.rule, `%${q}%`),
    like(schema.decisions.outcome, `%${q}%`),
    like(schema.decisions.explanation, `%${q}%`),
    like(schema.decisions.inputs, `%${q}%`),
  ) ?? eq(schema.decisions.id, "");

const filtersOf = (query: DecisionQuery): readonly SQL[] => [
  ...(query.taskId === undefined ? [] : [eq(schema.decisions.taskId, query.taskId)]),
  ...(query.from === undefined ? [] : [gte(schema.decisions.at, query.from)]),
  ...(query.to === undefined ? [] : [lte(schema.decisions.at, query.to)]),
  ...(query.q === undefined ? [] : [textFilter(query.q)]),
];

/** Appends decisions, stamped with an id and `now`. */
export const insertDecisions = async (
  db: Db,
  entries: readonly DecisionEntry[],
  now: string,
): Promise<void> => {
  for (const decision of entries) {
    await db.insert(schema.decisions).values({
      ...decision,
      at: now,
      id: decision.id ?? newId(),
      inputs: JSON.stringify(decision.inputs),
    });
  }
};

/** The decision log, filtered, newest first. */
export const listDecisions = async (
  db: Db,
  query: DecisionQuery,
): Promise<readonly DecisionRecord[]> => {
  const rows = await db
    .select()
    .from(schema.decisions)
    .where(and(...filtersOf(query)))
    .orderBy(desc(schema.decisions.at))
    .limit(query.limit);
  return rows.map((row) => toDecision(row));
};

/**
Records what the person did with readings: the first answer for a decision stands, so a late
Cancel cannot undo an approval. An approval names the task it created, which the row then opens.
Answers the number of rows changed.
*/
export const resolveDecisions = async (
  db: Db,
  answers: readonly DecisionAnswer[],
): Promise<number> => {
  let changed = 0;
  for (const answer of answers) {
    const rows = await db
      .update(schema.decisions)
      .set({
        resolution: answer.resolution,
        ...(answer.taskId !== undefined && { taskId: answer.taskId }),
      })
      .where(and(eq(schema.decisions.id, answer.id), isNull(schema.decisions.resolution)))
      .returning({ id: schema.decisions.id });
    changed += rows.length;
  }
  return changed;
};
