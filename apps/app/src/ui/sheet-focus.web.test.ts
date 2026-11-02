import { didFocusFirstOf, didFocusSheetStart, sheetStartStops } from "./sheet-focus.web.ts";

/** A fake element: a field or another stop, which takes focus unless it is hidden. */
type Fake = {
  readonly name: string;
  readonly isField: boolean;
  readonly isHidden: boolean;
  readonly focus: () => void;
  readonly getAttribute: (name: string) => null | string;
  readonly matches: (selector: string) => boolean;
};

const page = { active: null as Fake | null };

const element = (name: string, kind: "field" | "stop", isHidden = false): Fake => {
  const fake: Fake = {
    focus: () => {
      if (!fake.isHidden) {
        page.active = fake;
      }
    },
    getAttribute: (attribute) => (attribute === "aria-label" ? name : null),
    isField: kind === "field",
    isHidden,
    matches: () => fake.isField,
    name,
  };
  return fake;
};

/**
A sheet surface holding `elements` in order; fields answer the field query, all the stop one. It
takes focus itself too, as "the sheet", but only while it has a tab index (a plain block does not).
*/
const surface = (elements: readonly Fake[]) => {
  const attributes = new Map<string, string>();
  const sheet = {
    ...element("the sheet", "stop"),
    contains: (other: unknown) => elements.includes(other as Fake),
    focus: () => {
      if (attributes.has("tabindex")) {
        page.active = sheet;
      }
    },
    hasAttribute: (name: string) => attributes.has(name),
    querySelectorAll: (selector: string) =>
      selector.startsWith("input") ? elements.filter((item) => item.isField) : elements,
    removeAttribute: (name: string) => {
      attributes.delete(name);
    },
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
  };
  return sheet;
};

const names = (stops: readonly unknown[]) => stops.map((stop) => (stop as Fake).name);

const stopsOf = (elements: readonly Fake[], hasKeyboard: boolean) =>
  sheetStartStops(surface(elements) as unknown as HTMLElement, {
    active: page.active as unknown as Element | null,
    closeLabel: "Close",
    hasKeyboard,
  });

const didOpenOn = (sheet: ReturnType<typeof surface>) =>
  didFocusSheetStart(sheet as unknown as HTMLElement, {
    active: () => page.active as unknown as Element | null,
    closeLabel: "Close",
    hasKeyboard: true,
  });

describe("where an open sheet starts on the web (QA 18 M1, fix round 5 V4)", () => {
  beforeEach(() => {
    page.active = null;
  });

  it("starts on the first field with a keyboard, then the other controls, never the cross", () => {
    const sheet = [element("Close", "stop"), element("Title", "field"), element("Save", "stop")];
    expect(names(stopsOf(sheet, true))).toEqual(["Title", "Save"]);
  });

  it("starts on no text field on a touch screen, so no on-screen keyboard covers the sheet", () => {
    const sheet = [element("Close", "stop"), element("Title", "field"), element("Save", "stop")];
    expect(names(stopsOf(sheet, false))).toEqual(["Save"]);
  });

  it("starts on the sheet itself when it holds nothing to focus but the cross (a block's details)", () => {
    const sheet = [element("Close", "stop")];
    expect(names(stopsOf(sheet, true))).toEqual(["the sheet"]);
  });

  it("leaves focus where a field put it itself", () => {
    const sheet = [element("Title", "field"), element("Notes", "field")];
    page.active = sheet[1] ?? null;
    expect(stopsOf(sheet, true)).toEqual([]);
  });

  it("goes on to the next field when the first can never take focus (a hidden section)", () => {
    const sheet = [element("Hidden", "field", true), element("Title", "field")];
    expect(
      didFocusFirstOf(stopsOf(sheet, true), () => page.active as unknown as Element | null),
    ).toBe(true);
    expect(page.active?.name).toBe("Title");
  });

  it("says none took focus while the sheet is not shown yet, to try again next frame", () => {
    const sheet = [element("Title", "field", true), element("Save", "stop", true)];
    expect(
      didFocusFirstOf(stopsOf(sheet, true), () => page.active as unknown as Element | null),
    ).toBe(false);
    expect(page.active).toBeNull();
  });

  describe("taking focus as it opens", () => {
    it("makes the sheet itself focusable when it holds nothing else, and focuses it", () => {
      const sheet = surface([element("Close", "stop")]);
      expect(didOpenOn(sheet)).toBe(true);
      expect(page.active?.name).toBe("the sheet");
      expect(sheet.hasAttribute("tabindex")).toBe(true);
    });

    it("leaves the sheet itself out of the focus walk when it holds a control (round 7, class 106)", () => {
      // react-native-web's modal trap tries each element before its descendants when Tab leaves
      // the sheet: a focusable surface would take every such walk (the date picker's Shift+Tab).
      const sheet = surface([element("Close", "stop"), element("Monday, November 2", "stop")]);
      sheet.setAttribute("tabindex", "-1");
      expect(didOpenOn(sheet)).toBe(true);
      expect(page.active?.name).toBe("Monday, November 2");
      expect(sheet.hasAttribute("tabindex")).toBe(false);
    });

    it("tries again next frame while nothing took focus yet", () => {
      const sheet = surface([element("Save", "stop", true)]);
      expect(didOpenOn(sheet)).toBe(false);
      expect(page.active).toBeNull();
    });
  });
});
