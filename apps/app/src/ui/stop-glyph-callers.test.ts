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

/** The JSX element around `index`: from its `<Tag` to the end of its opening tag. */
const elementAround = (text: string, index: number): string => {
  const start = text.lastIndexOf("<", index);
  const close = text.indexOf(">\n", index);
  return text.slice(start, close === -1 ? text.length : close);
};

describe("Stop's square (F-CMP-04, design review 2 N1, bug-lessons 175)", () => {
  it("is filled wherever it is drawn: an outlined square alone reads as an unchecked checkbox", () => {
    const offenders = sources(SRC).flatMap((file) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- files of this app's own source tree
      const text = readFileSync(file, "utf8");
      return text
        .matchAll(/icon=[^\n]*"square"/gu)
        .filter((match) => !/is(?:Icon)?Filled/u.test(elementAround(text, match.index)))
        .map(() => path.relative(SRC, file))
        .toArray();
    });
    expect(offenders).toEqual([]);
  });
});
