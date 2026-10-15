import { browserComputerOs } from "./computer-os.web.ts";

const withNavigator = (fields: Record<string, unknown>): void => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: fields });
};

describe("the computer's system in a browser", () => {
  const original = globalThis.navigator;
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: original });
  });

  it("prefers the client hints, then the platform, then the user agent", () => {
    withNavigator({ platform: "Win32", userAgentData: { platform: "macOS" } });
    expect(browserComputerOs()).toBe("macos");
    withNavigator({ platform: "Linux x86_64", userAgent: "" });
    expect(browserComputerOs()).toBe("linux");
    withNavigator({ platform: "", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    expect(browserComputerOs()).toBe("windows");
  });

  it("says nothing on a phone", () => {
    withNavigator({ platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 14)" });
    expect(browserComputerOs()).toBeNull();
  });
});
