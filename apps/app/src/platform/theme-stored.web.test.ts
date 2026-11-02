import { storedThemePreference } from "./theme-stored.web.ts";

const withStorage = (storage: unknown): void => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
};

describe("the stored theme preference, read at the first render on the web", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, "localStorage");
    } else {
      Object.defineProperty(globalThis, "localStorage", original);
    }
  });

  it("is what the app (and theme-boot.js) keep under pace.theme", () => {
    withStorage({ getItem: (key: string) => (key === "pace.theme" ? "dark" : null) });
    expect(storedThemePreference()).toBe("dark");
  });

  it("is nothing where the storage is empty or blocked", () => {
    withStorage({ getItem: () => null });
    expect(storedThemePreference()).toBeNull();
    withStorage({
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(storedThemePreference()).toBeNull();
  });
});
