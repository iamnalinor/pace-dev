import type { RefObject } from "react";
import type { View } from "react-native";

import { focusUndoIfLost } from "./toast-focus.web.ts";

/** A toast's action place whose button records being focused. */
const placeWith = (focus: () => void): RefObject<null | View> =>
  ({
    current: { querySelector: () => ({ focus }) },
  }) as unknown as RefObject<null | View>;

const withDocument = (activeElement: unknown, body: unknown): void => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement, body },
  });
};

describe("an Undo toast and the focus a delete dropped (QA round 27 R27-09)", () => {
  const original = globalThis.document;
  beforeEach(() => {
    jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((run) => {
      run(0);
      return 0;
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: original });
    jest.restoreAllMocks();
  });

  it("takes focus that was left on the page", () => {
    const body = {};
    withDocument(body, body);
    const focus = jest.fn();
    focusUndoIfLost(placeWith(focus));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("leaves focus the person put somewhere", () => {
    withDocument({}, {});
    const focus = jest.fn();
    focusUndoIfLost(placeWith(focus));
    expect(focus).not.toHaveBeenCalled();
  });
});
