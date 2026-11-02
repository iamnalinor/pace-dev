import { readFileSync } from "node:fs";
import path from "node:path";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path: this app's own stylesheet
const CSS = readFileSync(path.join(__dirname, "../../global.css"), "utf8")
  .split("*/")
  .map((part) => part.slice(0, part.includes("/*") ? part.indexOf("/*") : part.length))
  .join("");

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
});
