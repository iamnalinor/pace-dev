import type { ESLint } from "eslint";

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

/**
Clears the report file before a run, so a report found afterwards is this run's: a crashed ESLint
leaves no file instead of an old one that would be printed as if it were current.
*/
export const clearReport = (report: string): void => {
  mkdirSync(path.dirname(report), { recursive: true });
  rmSync(report, { force: true });
};

/** This run's results, or `undefined` when ESLint wrote no readable report. */
export const readReport = async (report: string): Promise<ESLint.LintResult[] | undefined> => {
  try {
    return JSON.parse(await Bun.file(report).text()) as ESLint.LintResult[];
  } catch {
    return undefined;
  }
};
