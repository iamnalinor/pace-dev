import { readFileSync } from "node:fs";
import path from "node:path";

import { motion } from "@pace/core";

// eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path: this app's own stylesheet
const CSS = readFileSync(path.join(__dirname, "../../global.css"), "utf8").replaceAll(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The declarations of the first rule whose selector is exactly `selector`, in `css`. */
const declarations = (selector: string, css: string = CSS): readonly string[] => {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return [];
  }
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
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
const OVERLAY = `${MARK}::after`;
const HOVER_MEDIA = "(hover: hover) and (pointer: fine)";
const FORCED_MEDIA = "(forced-colors: active)";
const bezier = (points: readonly number[]): string => `cubic-bezier(${points.join(", ")})`;

/** The declarations of a rule inside the forced-colours block. */
const forced = (selector: string): readonly string[] =>
  declarations(selector, mediaBlock(FORCED_MEDIA));

/** The stylesheet without the forced-colours block, where the overlay is switched off. */
const outsideForced = (): string => CSS.replace(mediaBlock(FORCED_MEDIA), "");

describe("the web state layer (global.css, spec §3.7)", () => {
  it("is an overlay above the content: an opaque child cannot hide it, a click passes through", () => {
    expect(declarations(OVERLAY, outsideForced())).toEqual(
      expect.arrayContaining([
        'content: ""',
        "position: absolute",
        "inset: 0",
        "border-radius: inherit",
        "pointer-events: none",
      ]),
    );
  });

  it("leaves the control's own shadow and transition alone (it draws on the overlay only)", () => {
    const own = declarations(MARK);
    expect(
      own.filter((declaration) => /^(?:box-shadow|transition|background)/.test(declaration)),
    ).toEqual([]);
    expect(CSS).not.toContain("box-shadow: inset");
  });

  it("goes out in duration.xs on easing.exit, from the motion tokens", () => {
    expect(declarations(OVERLAY, outsideForced())).toContain(
      `transition: background-color ${motion.duration.xs}ms ${bezier(motion.easing.exit)}`,
    );
  });

  it("comes in at once when pressed, in fill.2, and never on a disabled control", () => {
    const pressed = declarations(`${ENABLED}:active::after`);
    expect(pressed).toContain("transition-duration: 0s");
    expect(pressed).toContain("background-color: var(--pace-fill-2)");
  });

  it("hovers in fill.1 only for a pointer that hovers (a tap never leaves it stuck)", () => {
    const hoverRule = `${ENABLED}:hover::after`;
    expect(mediaBlock(HOVER_MEDIA)).toContain(hoverRule);
    // Outside that block the selector must not appear.
    expect(CSS.replace(mediaBlock(HOVER_MEDIA), "")).not.toContain(":hover");
    expect(declarations(hoverRule, mediaBlock(HOVER_MEDIA))).toContain(
      "background-color: var(--pace-fill-1)",
    );
  });

  it("selects no text and opens no callout on a long press (F-WEB-10)", () => {
    expect(declarations(MARK)).toEqual(
      expect.arrayContaining(["user-select: none", "-webkit-touch-callout: none"]),
    );
  });

  describe("a small visual inside its target (data-pace-inner)", () => {
    const INNER = "[data-pace-inner]";
    const VISUAL = `${INNER} > [data-pace-visual]`;

    it("moves the overlay from the target onto the visual", () => {
      expect(declarations(`${INNER}::after`, outsideForced())).toContain("display: none");
      // The visual's overlay is the same rule as the control's (one rule, two selectors).
      expect(CSS).toContain(`${VISUAL}::after,\n${OVERLAY} {`);
    });

    it("hovers and presses the visual, never a disabled one", () => {
      const enabled = `${INNER}:not([aria-disabled="true"])`;
      expect(
        declarations(`${enabled}:hover > [data-pace-visual]::after`, mediaBlock(HOVER_MEDIA)),
      ).toContain("background-color: var(--pace-fill-1)");
      expect(declarations(`${enabled}:active > [data-pace-visual]::after`)).toEqual(
        expect.arrayContaining(["background-color: var(--pace-fill-2)", "transition-duration: 0s"]),
      );
    });

    it("rings the visual, not the transparent target, on keyboard focus", () => {
      expect(declarations(`${INNER}:focus-visible`)).toContain("outline: none");
      expect(declarations(`${INNER}:focus-visible > [data-pace-visual]`)).toEqual(
        expect.arrayContaining(["outline: 2px solid var(--pace-focus)", "outline-offset: 2px"]),
      );
    });
  });

  describe("in forced colours (F-A11Y-04)", () => {
    it("draws each control's boundary in ButtonBorder, as an outline that moves no layout", () => {
      expect(forced(MARK)).toEqual(
        expect.arrayContaining(["outline: 1px solid ButtonBorder", "outline-offset: -1px"]),
      );
    });

    it("draws the keyboard ring in Highlight", () => {
      expect(forced(`${MARK}:focus-visible`)).toEqual(
        expect.arrayContaining(["outline: 2px solid Highlight", "outline-offset: 2px"]),
      );
    });

    it("marks selected and checked in Highlight / HighlightText", () => {
      const marked = forced(`${MARK}:is([aria-selected="true"], [aria-checked="true"])`);
      expect(marked).toEqual(
        expect.arrayContaining(["background-color: Highlight", "color: HighlightText"]),
      );
    });

    it("drops the tinted overlay, which the system would repaint opaque over the label", () => {
      expect(forced(OVERLAY)).toContain("display: none");
    });
  });
});
