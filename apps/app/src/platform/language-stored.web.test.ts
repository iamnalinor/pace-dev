import { storedLanguage, storeLanguage } from "./language-stored.web.ts";

const blocked = (): never => {
  throw new Error("blocked");
};

const withStorage = (storage: unknown): void => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
};

describe("the account's language kept for the first paint on the web (F-DAT-04)", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, "localStorage");
    } else {
      Object.defineProperty(globalThis, "localStorage", original);
    }
  });

  it("is kept under pace.language (theme-boot.js reads the same key) and forgotten on null", () => {
    const kept = new Map<string, string>();
    withStorage({
      getItem: (key: string) => kept.get(key) ?? null,
      removeItem: (key: string) => kept.delete(key),
      setItem: (key: string, value: string) => kept.set(key, value),
    });
    expect(storedLanguage()).toBeNull();
    storeLanguage("ru");
    expect(kept.get("pace.language")).toBe("ru");
    expect(storedLanguage()).toBe("ru");
    storeLanguage(null);
    expect(storedLanguage()).toBeNull();
  });

  it("reads nothing from a value that is no language, or from a blocked storage", () => {
    withStorage({ getItem: () => "de" });
    expect(storedLanguage()).toBeNull();
    withStorage({ getItem: blocked, removeItem: blocked, setItem: blocked });
    expect(storedLanguage()).toBeNull();
    expect(() => {
      storeLanguage("ru");
    }).not.toThrow();
  });
});
