import { isFocusLost } from "./move-focus.web.ts";

const withDocument = (activeElement: unknown, body: unknown): void => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement, body },
  });
};

describe("whether focus is lost in a browser", () => {
  const original = globalThis.document;
  afterEach(() => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: original });
  });

  it("is lost on the page itself or on nothing, kept on any element", () => {
    const body = {};
    withDocument(body, body);
    expect(isFocusLost()).toBe(true);
    withDocument(null, body);
    expect(isFocusLost()).toBe(true);
    withDocument({}, body);
    expect(isFocusLost()).toBe(false);
  });
});
