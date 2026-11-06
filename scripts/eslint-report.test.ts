import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { clearReport, readReport } from "./eslint-report.ts";

const dir = mkdtempSync(path.join(tmpdir(), "eslint-report-"));
afterEach(() => {
  rmSync(path.join(dir, "part.json"), { force: true });
});

describe("the ESLint report file", () => {
  it("removes a stale report before a run, so a crash leaves none to print", async () => {
    const report = path.join(dir, "part.json");
    writeFileSync(report, "[]");
    clearReport(report);
    expect(existsSync(report)).toBe(false);
    expect(await readReport(report)).toBeUndefined();
  });

  it("creates the folder it is told to write in", () => {
    clearReport(path.join(dir, "nested", "part.json"));
    expect(existsSync(path.join(dir, "nested"))).toBe(true);
  });

  it("reads this run's results, and nothing from a half-written file", async () => {
    const report = path.join(dir, "part.json");
    writeFileSync(report, "[]");
    expect(await readReport(report)).toEqual([]);
    writeFileSync(report, "[{");
    expect(await readReport(report)).toBeUndefined();
  });
});
