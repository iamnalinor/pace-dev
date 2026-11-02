import { refuseFocus } from "./refuse-focus.web.ts";

/** An element of the page: inside `parent` (and so inside everything around it). */
type Node = {
  readonly blur: jest.Mock;
  readonly closest: (selector: string) => Node | null;
  readonly contains: (other: unknown) => boolean;
  readonly isModal: boolean;
  readonly parent: Node | null;
};

const node = (parent: Node | null, isModal = false): Node => {
  const self: Node = {
    blur: jest.fn(),
    closest: (selector) => {
      expect(selector).toBe('[aria-modal="true"]');
      let at: Node | null = self;
      while (at !== null && !at.isModal) {
        at = at.parent;
      }
      return at;
    },
    contains: (other) => {
      let at = other as Node | null;
      while (at !== null) {
        if (at === self) {
          return true;
        }
        at = at.parent;
      }
      return false;
    },
    isModal,
    parent,
  };
  return self;
};

/** A page with a sheet: the modal (between its focus brackets), its dim and one control. */
const page = () => {
  const body = node(null);
  const opener = node(body);
  const bracket = node(body);
  const modal = node(body, true);
  const dim = node(modal);
  const control = node(node(modal));
  return { bracket, control, dim, opener };
};

describe("the sheet's dim on the web refuses only the focus trap's focus (round 6 M4)", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  beforeEach(() => {
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: Object });
  });
  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    } else {
      Object.defineProperty(globalThis, "HTMLElement", original);
    }
  });

  it("gives focus back when the trap walks onto it as the sheet opens", () => {
    const { dim, opener } = page();
    refuseFocus({ currentTarget: dim, relatedTarget: opener });
    refuseFocus({ currentTarget: dim, relatedTarget: null });
    expect(dim.blur).toHaveBeenCalledTimes(2);
  });

  it("gives focus back when Tab or Shift+Tab wraps the trap onto it from a focus bracket", () => {
    const { bracket, dim } = page();
    refuseFocus({ currentTarget: dim, nativeEvent: { relatedTarget: bracket } });
    expect(dim.blur).toHaveBeenCalledTimes(1);
  });

  it("keeps a screen reader's focus moving onto it from the sheet: no throw to the page", () => {
    const { control, dim } = page();
    refuseFocus({ currentTarget: dim, nativeEvent: { relatedTarget: control } });
    expect(dim.blur).not.toHaveBeenCalled();
  });
});
