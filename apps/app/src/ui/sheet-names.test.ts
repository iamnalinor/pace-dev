import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  createSourceFile,
  forEachChild,
  isJsxAttribute,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isStringLiteral,
  type Node,
  ScriptKind,
  ScriptTarget,
} from "typescript";

import { SHEET_NAMES } from "./sheet-names.ts";

/** The app's own sources: the router's folder and `src`, tests left out. */
const APP = path.resolve(__dirname, "../..");

const sourceFiles = (): readonly string[] =>
  [path.join(APP, "app"), path.join(APP, "src")].flatMap((folder) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the app's own folders, computed above
    readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
      .filter((entry) => !entry.name.endsWith(".test.tsx"))
      .map((entry) => path.join(entry.parentPath, entry.name)),
  );

/** One `<Sheet>` in the sources: where, and its `name` when it is a string literal. */
type Usage = { readonly at: string; readonly name: null | string };

/** Every `<Sheet>` element of `file`, read from its syntax tree. */
const usagesIn = (file: string): readonly Usage[] => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file the listing above found in the app
  const text = readFileSync(file, "utf8");
  const source = createSourceFile(file, text, ScriptTarget.Latest, true, ScriptKind.TSX);
  const found: Usage[] = [];
  const visit = (node: Node): void => {
    if (
      (isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) &&
      node.tagName.getText(source) === "Sheet"
    ) {
      const attribute = node.attributes.properties.find(
        (property) => isJsxAttribute(property) && property.name.getText(source) === "name",
      );
      const value =
        attribute !== undefined && isJsxAttribute(attribute) ? attribute.initializer : undefined;
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({
        at: `${path.relative(APP, file)}:${String(line + 1)}`,
        name: value !== undefined && isStringLiteral(value) ? value.text : null,
      });
    }
    forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const byText = (a: string, b: string): number => a.localeCompare(b);

describe("the registry of sheets (e2e/sheet-focus.e2e.ts opens each one)", () => {
  const usages = sourceFiles().flatMap((file) => usagesIn(file));

  it("finds the app's sheets", () => {
    expect(usages.length).toBeGreaterThan(5);
  });

  it("names every sheet with a literal from the registry", () => {
    expect(usages.filter((usage) => usage.name === null).map((usage) => usage.at)).toEqual([]);
  });

  it("gives each sheet a name of its own, and every registered name a sheet", () => {
    const names = usages.map((usage) => usage.name ?? "");
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    expect(names.toSorted(byText)).toEqual(SHEET_NAMES.toSorted(byText));
  });
});
