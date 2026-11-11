import type { View } from "react-native";

import { claimFocus } from "./claim-focus.web.ts";

/** The page's focused element, as the fake document reports it. */
const page = { activeElement: null as unknown };

/** A fake element that records how it was focused. */
const fakeElement = () => {
  const calls: unknown[] = [];
  const element = {
    calls,
    focus: (options?: unknown) => {
      calls.push(options);
      page.activeElement = element;
    },
  };
  return element;
};

beforeAll(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: page });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "document");
});

beforeEach(() => {
  jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((run) => {
    run(0);
    return 1;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("claimFocus on the web", () => {
  it("leaves the scrolling to the overlay that reveals the view, when asked (R28-03, bug-lessons 350)", () => {
    // focus() scrolled the date panel's chosen day into view a frame after the sheet began to reveal
    // the whole panel, and the browser dropped the reveal: only the panel's top showed at 1440.
    const element = fakeElement();
    claimFocus(() => element as unknown as View, { preventScroll: true });
    expect(element.calls).toEqual([{ preventScroll: true }]);
  });

  it("lets the browser bring the control into view otherwise", () => {
    const element = fakeElement();
    claimFocus(() => element as unknown as View);
    expect(element.calls).toEqual([{ preventScroll: false }]);
  });
});
