import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
A focused test (`it.only`, `describe.only`, `test.only`, a RuleTester `itOnly` or case with
`only: true`) skips every other test of its file locally and fails the whole run in CI, where Bun
refuses `.only` (fix round 3: `RuleTester.itOnly = it.only` stopped `bun test:unit` in CI while
every local run passed, because only CI sets `CI`). This reads every test file, so no run's
environment decides whether the guard sees one.
*/
const ROOT = path.join(import.meta.dir, "..");

const TEST_GLOBS = [
  "{packages,apps}/*/{src,tests}/**/*.{test,int.test}.{ts,tsx}",
  "scripts/**/*.test.ts",
  "e2e/**/*.e2e.ts",
];

const testFiles = (): readonly string[] =>
  TEST_GLOBS.flatMap((glob) => [...new Bun.Glob(glob).scanSync({ cwd: ROOT })]).filter(
    (file) => !file.includes("node_modules"),
  );

/** Where a source focuses a test, as `line: text` (this file is left out of the sweep). */
const focusedLines = (source: string): readonly string[] => {
  const focus = new RegExp(
    String.raw`\b(?:it|test|describe|context)\s*\.\s*only\b|\bitOnly\b|\bonly\s*:\s*true\b`,
    "u",
  );
  return source
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => focus.test(line))
    .map(({ line, number }) => `${String(number)}: ${line.trim()}`);
};

describe("focused tests", () => {
  it("finds every way a test is focused", () => {
    const sample = ["it.only('a', f);", "RuleTester.itOnly = it;", "{ code: 'x', only: true }"];
    expect(focusedLines(sample.join("\n"))).toHaveLength(3);
    expect(focusedLines('it("reads only the first line", f);')).toEqual([]);
  });

  it("none is focused anywhere", () => {
    const found = testFiles()
      .filter((file) => file !== "scripts/no-focused-tests.test.ts")
      .flatMap((file) =>
        focusedLines(readFileSync(path.join(ROOT, file), "utf8")).map((hit) => `${file}:${hit}`),
      );
    expect(found).toEqual([]);
  });
});
