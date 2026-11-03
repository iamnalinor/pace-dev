import { readFileSync } from "node:fs";
import path from "node:path";

import { motion } from "@pace/core";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path: this app's own stylesheet
const CSS = readFileSync(path.join(__dirname, "../../global.css"), "utf8").replaceAll(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The declarations of the first rule whose selector is exactly `selector`, inside any block. */
const declarations = (selector: string): readonly string[] => {
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) {
    return [];
  }
  const body = CSS.slice(CSS.indexOf("{", start) + 1, CSS.indexOf("}", start));
  return body
    .split(";")
    .map((declaration) => declaration.trim().replaceAll(/\s+/g, " "))
    .filter((declaration) => declaration !== "");
};

/** The CSS body of the first `@media <query>` block. */
const mediaBlock = (query: string): string => {
  const start = CSS.indexOf(`@media ${query} {`);
  if (start === -1) {
    return "";
  }
  let depth = 0;
  for (let index = CSS.indexOf("{", start); index < CSS.length; index += 1) {
    if (CSS[index] === "{") {
      depth += 1;
    } else if (CSS[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return CSS.slice(start, index);
      }
    }
  }
  return "";
};

const MARK = "[data-pace-press]";
const ENABLED = `${MARK}:not([aria-disabled="true"])`;
const bezier = (points: readonly number[]): string => `cubic-bezier(${points.join(", ")})`;

describe("the web state layer (global.css, spec §3.7)", () => {
  it("goes out in duration.xs on easing.exit, from the motion tokens", () => {
    expect(declarations(MARK)).toContain(
      `transition: box-shadow ${motion.duration.xs}ms ${bezier(motion.easing.exit)}`,
    );
  });

  it("comes in at once when pressed, in fill.2, and never on a disabled control", () => {
    const pressed = declarations(`${ENABLED}:active`);
    expect(pressed).toContain("transition-duration: 0s");
    expect(pressed).toContain("box-shadow: inset 0 0 0 100vmax var(--pace-fill-2)");
  });

  it("hovers in fill.1 only for a pointer that hovers (a tap never leaves it stuck)", () => {
    const hoverRule = `${ENABLED}:hover`;
    expect(mediaBlock("(hover: hover) and (pointer: fine)")).toContain(hoverRule);
    // Outside that block the selector must not appear.
    expect(CSS.replace(mediaBlock("(hover: hover) and (pointer: fine)"), "")).not.toContain(
      ":hover",
    );
    expect(declarations(hoverRule)).toContain("box-shadow: inset 0 0 0 100vmax var(--pace-fill-1)");
  });

  it("selects no text and opens no callout on a long press (F-WEB-10)", () => {
    expect(declarations(MARK)).toEqual(
      expect.arrayContaining(["user-select: none", "-webkit-touch-callout: none"]),
    );
  });

  it("maps the ring, the selected state and the boundary to system colours in forced colours", () => {
    const forced = mediaBlock("(forced-colors: active)");
    expect(forced).toContain("ButtonBorder");
    expect(forced).toContain("Highlight");
    expect(forced).toContain("HighlightText");
  });
});
