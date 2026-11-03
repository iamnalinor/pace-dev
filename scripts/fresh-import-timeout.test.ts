import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
A test that loads modules afresh (`vi.resetModules()` then `await import(…)`) pays a cold
transform of the whole graph it imports; on a loaded machine that alone outlasts vitest's 5 s
default (`ids-no-prng.test.ts`, pr48 follow-up A8; `initials.test.ts` before it). Every such file
gives those tests a timeout of their own.
*/
const ROOT = path.join(import.meta.dir, "..");

/** Every unit and Worker test, and these scripts' own (Bun's glob takes no `/` inside braces). */
const TEST_GLOBS = ["{packages,apps}/*/{src,tests}/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"];

const testFiles = (): readonly string[] =>
  TEST_GLOBS.flatMap((glob) => [...new Bun.Glob(glob).scanSync({ cwd: ROOT })]).filter(
    (file) => !file.includes("node_modules"),
  );

/**
A `describe` or `it` given its own timeout by a named constant (`{ timeout: FRESH_IMPORT_MS }`),
not any `timeout:` in the file (a `waitFor({ timeout })` says nothing about the test's own).
*/
const hasOwnTimeout = (source: string): boolean =>
  /\b(?:describe|it)\(\s*(?:"[^"]*"|`[^`]*`),\s*\{\s*timeout: [A-Z][A-Z_]*_MS\b/u.test(source);

const isFreshImporter = (source: string): boolean =>
  source.includes("vi.resetModules()") && source.includes("await import(");

describe("tests that import afresh", () => {
  it("tells a test's own timeout from a waitFor's (review M4)", () => {
    expect(hasOwnTimeout('describe("x", { timeout: FRESH_IMPORT_MS }, () => {')).toBe(true);
    expect(hasOwnTimeout('it("x", {\n    timeout: WHOLE_CORE_IMPORT_MS,\n  }, async () => {')).toBe(
      true,
    );
    expect(hasOwnTimeout("await waitFor(() => {}, { timeout: 3000 });")).toBe(false);
    expect(hasOwnTimeout('it("x", async () => { await waitFor(f, { timeout: WAIT_MS }); });')).toBe(
      false,
    );
  });

  it("finds the files it guards", () => {
    expect(
      testFiles().filter((file) => isFreshImporter(readFileSync(path.join(ROOT, file), "utf8"))),
    ).toContain("packages/core/src/ids-no-prng.test.ts");
  });

  it("give themselves a timeout beyond vitest's default", () => {
    const missing = testFiles().filter((file) => {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      return isFreshImporter(source) && !hasOwnTimeout(source);
    });
    expect(missing).toEqual([]);
  });
});
