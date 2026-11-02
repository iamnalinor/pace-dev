import { enterAtStop } from "./enter-at-stop.web.ts";

/** An element of the page: inside `parent` (and so inside everything around it). */
type Node = {
  readonly focus: jest.Mock;
  readonly closest: () => null;
  readonly contains: (other: unknown) => boolean;
  readonly parent: Node | null;
};

const node = (parent: Node | null): Node => {
  const self: Node = {
    closest: () => null,
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
    focus: jest.fn(),
    parent,
  };
  return self;
};

/** A sheet with Close above a grid of days: the stop, the selected day, another one. */
const sheet = () => {
  const modal = node(null);
  const close = node(modal);
  const grid = node(modal);
  const stop = node(grid);
  const selected = node(grid);
  return { close, grid, selected, stop };
};

describe("a roving grid's other cells on the web send focus from outside to the stop (round 7)", () => {
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

  it("moves the focus the sheet's trap walks onto it from Close (Shift+Tab wrapping) to the stop", () => {
    // react-native-web's trap focuses the first control, then walks back from the last: every
    // focus it tries comes from inside the modal, so "from outside the modal" cannot tell it.
    const { close, grid, selected, stop } = sheet();
    enterAtStop({ currentTarget: selected, nativeEvent: { relatedTarget: close } }, grid, stop);
    expect(stop.focus).toHaveBeenCalledTimes(1);
  });

  it("moves focus coming from nowhere (the page) to the stop", () => {
    const { grid, selected, stop } = sheet();
    enterAtStop({ currentTarget: selected, relatedTarget: null }, grid, stop);
    expect(stop.focus).toHaveBeenCalledTimes(1);
  });

  it("keeps focus moving inside the grid (a screen reader, a press): never thrown to the page", () => {
    const { grid, selected, stop } = sheet();
    enterAtStop({ currentTarget: selected, nativeEvent: { relatedTarget: stop } }, grid, stop);
    expect(stop.focus).not.toHaveBeenCalled();
  });
});
