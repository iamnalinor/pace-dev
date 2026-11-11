import { readFileSync } from "node:fs";
import path from "node:path";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path: this app's own stylesheet
const SHEET = readFileSync(path.join(__dirname, "../../global.css"), "utf8")
  .split("*/")
  .map((part) => part.slice(0, part.includes("/*") ? part.indexOf("/*") : part.length))
  .join("");

/*
Forced colours hand every colour to the system (ButtonBorder, Highlight): that block is the one
place a ring is not in the focus role, and `state-layer.test.ts` checks it. It is the last block
of the sheet, so everything from it on is left out here.
*/
const FORCED = SHEET.indexOf("@media (forced-colors: active)");
const CSS = FORCED === -1 ? SHEET : SHEET.slice(0, FORCED);

type Outline = { readonly selector: string; readonly value: string };

/** Every `outline:` declaration of the stylesheet, with the selector it sits under. */
const outlines = (): readonly Outline[] =>
  CSS.split("}").flatMap((rule): readonly Outline[] => {
    const [selector = "", body = ""] = rule.split("{", 2);
    return body
      .split(";")
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration.startsWith("outline:"))
      .map((declaration) => ({
        selector: selector.trim(),
        value: declaration.slice("outline:".length).trim(),
      }));
  });

describe("the focus ring", () => {
  it("is drawn by the page for every control, in the focus role, not in the browser's ink", () => {
    const ring = outlines().find(({ selector }) => selector === ":focus-visible");
    expect(ring?.value).toBe("2px solid var(--pace-focus)");
  });

  it("never draws a ring in anything but the focus role (a text field hides its own box)", () => {
    const rings = outlines().filter(({ value }) => value !== "none");
    expect(rings.filter(({ value }) => !value.includes("var(--pace-focus)"))).toEqual([]);
  });

  it("hides no ring from the range slider, an input like the text fields (its keyboard ring was lost)", () => {
    const hiding = outlines().filter(({ value }) => value === "none");
    expect(hiding.length).toBeGreaterThan(0);
    const inputs = hiding.filter(({ selector }) => selector.includes("input"));
    expect(inputs.filter(({ selector }) => !selector.includes(":not([data-pace-slider])"))).toEqual(
      [],
    );
  });

  it("keeps the forced-colours block last, so the reading above sees every other rule", () => {
    expect(FORCED).toBeGreaterThan(-1);
    const after = SHEET.slice(FORCED);
    expect(after.match(/@media/g)).toHaveLength(1);
  });
});

describe("the skip link out of sight", () => {
  it("is moved off the page by the viewport, not by its own height: a strip above the shell must not bring it into view (bug-lessons 381)", () => {
    const rule = /\[data-skip-link\]:not\(:focus-within\)\s*\{([^}]*)\}/u.exec(SHEET)?.[1] ?? "";
    expect(rule).toMatch(/translateY\(calc\(-100vh - 100%\)\)/u);
  });
});
