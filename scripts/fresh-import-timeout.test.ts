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

const testFiles = (): readonly string[] =>
  [...new Bun.Glob("{packages,apps}/*/src/**/*.test.{ts,tsx}").scanSync({ cwd: ROOT })].filter(
    (file) => !file.includes("node_modules"),
  );

const isFreshImporter = (source: string): boolean =>
  source.includes("vi.resetModules()") && source.includes("await import(");

describe("tests that import afresh", () => {
  it("finds the files it guards", () => {
    expect(
      testFiles().filter((file) => isFreshImporter(readFileSync(path.join(ROOT, file), "utf8"))),
    ).toContain("packages/core/src/ids-no-prng.test.ts");
  });

  it("give themselves a timeout beyond vitest's default", () => {
    const missing = testFiles().filter((file) => {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      return isFreshImporter(source) && !/\btimeout: /u.test(source);
    });
    expect(missing).toEqual([]);
  });
});
