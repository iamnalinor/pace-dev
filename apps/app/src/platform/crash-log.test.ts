import {
  type CrashGlobals,
  describeError,
  installCrashLog,
  languageOfLocale,
} from "./crash-log.ts";

const mockAppend = jest.fn<undefined, [string, string]>();

jest.mock("../../modules/pace-native/index.ts", () => ({
  paceNative: {
    appendCrashReport: (kind: string, details: string) => {
      mockAppend(kind, details);
    },
  },
}));

beforeEach(() => {
  mockAppend.mockClear();
});

/** An error with the stack a runtime would have given it. */
const withStack = <E extends Error>(error: E, stack: string): E =>
  Object.defineProperty(error, "stack", { value: stack });

type Tracker = Parameters<
  NonNullable<CrashGlobals["HermesInternal"]>["enablePromiseRejectionTracker"]
>[0];

/** Installs the crash log on fake globals and exposes what it hooked in. */
const install = (isDev: boolean) => {
  const previous = jest.fn();
  let handler: (error: unknown, isFatal?: boolean) => void = previous;
  let tracker: null | Tracker = null;
  const globals: CrashGlobals = {
    ErrorUtils: {
      getGlobalHandler: () => handler,
      setGlobalHandler: (next) => {
        handler = next;
      },
    },
    HermesInternal: {
      enablePromiseRejectionTracker: (options) => {
        tracker = options;
      },
    },
  };
  installCrashLog(globals, isDev);
  return { handler: () => handler, previous, tracker: () => tracker };
};

describe("describeError", () => {
  it("keeps Hermes' stack, which already starts with the name and message", () => {
    const error = withStack(
      new TypeError("undefined is not a function"),
      "TypeError: undefined is not a function\n    at sortEvents (index.bundle:1:2)",
    );
    expect(describeError(error)).toBe(error.stack);
  });

  it("puts the name and message above a stack that lacks them", () => {
    const error = withStack(new RangeError("bad"), "    at f (a.js:1:1)");
    expect(describeError(error)).toBe("RangeError: bad\n    at f (a.js:1:1)");
  });

  it("describes a thrown non-error and appends the component stack", () => {
    expect(describeError({ code: 42 }, "\n    in Day\n    in Tabs")).toBe(
      'Non-error thrown: {"code":42}\n\nComponent stack:\n    in Day\n    in Tabs',
    );
  });
});

describe("installCrashLog", () => {
  it("logs a fatal error, then hands it to the previous handler", () => {
    const { handler, previous } = install(false);
    const error = new Error("boom");
    handler()(error, true);
    expect(mockAppend).toHaveBeenCalledWith("js-fatal", describeError(error));
    expect(previous).toHaveBeenCalledWith(error, true);
  });

  it("logs a non-fatal error as js-error", () => {
    const { handler } = install(false);
    handler()(new Error("soft"), false);
    expect(mockAppend.mock.calls[0]?.[0]).toBe("js-error");
  });

  it("logs unhandled promise rejections in release builds only", () => {
    const release = install(false);
    release.tracker()?.onUnhandled(1, new Error("lost"));
    expect(mockAppend.mock.calls[0]?.[0]).toBe("promise");
    expect(install(true).tracker()).toBeNull();
  });

  it("does nothing where the globals are missing (the web)", () => {
    expect(() => {
      installCrashLog({}, false);
    }).not.toThrow();
  });
});

describe("languageOfLocale", () => {
  it("is Russian for ru locales and English otherwise", () => {
    expect(languageOfLocale("ru-RU")).toBe("ru");
    expect(languageOfLocale("ru")).toBe("ru");
    expect(languageOfLocale("en-US")).toBe("en");
    expect(languageOfLocale("de-DE")).toBe("en");
  });
});
