import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..");

/** Every source file under `apps/app/src` (tests aside). */
const sources = (dir: string): readonly string[] => {
  const found: string[] = [];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- directories of this app's own source tree
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "generated") {
        found.push(...sources(full));
      }
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
      found.push(full);
    }
  }
  return found;
};

describe("radios (QA round 21 L1, bug-lessons 84: one tab stop per group)", () => {
  it("every radio is drawn through useRadio, so it has a RadioGroup and a roving tab stop", () => {
    const offenders = sources(SRC)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- files of this app's own source tree
      .map((file) => ({ file, text: readFileSync(file, "utf8") }))
      .filter(({ text }) => /\s(?:accessibilityRole|role)="radio"/u.test(text))
      .filter(({ text }) => !text.includes("useRadio("))
      .map(({ file }) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
