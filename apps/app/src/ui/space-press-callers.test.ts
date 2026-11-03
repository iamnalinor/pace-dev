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

describe("spacePress callers (bug-lessons class 113: a disabled control gets no action)", () => {
  it("a file that disables a control passes the disabled state to spacePress", () => {
    const offenders = sources(SRC)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- files of this app's own source tree
      .map((file) => ({ file, text: readFileSync(file, "utf8") }))
      .filter(({ text }) => text.includes("spacePress(") && /\bdisabled=/.test(text))
      // `CheckCircle` is disabled exactly when it has no action: it passes `undefined`.
      .filter(
        ({ file, text }) => !file.endsWith("check-circle.tsx") && !/spacePress\([^)]*,/.test(text),
      )
      .map(({ file }) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
