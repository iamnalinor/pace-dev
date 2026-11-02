import { createSignOutNotes } from "./sign-out-notes.web.ts";

const withStorage = (value: unknown): void => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => value });
};

/** A localStorage holding its items in a map, as one profile's tabs share it. */
const memoryStorage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    items,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
};

describe("the sign-out note on the web (fix round 5 V1)", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, "localStorage");
    } else {
      Object.defineProperty(globalThis, "localStorage", original);
    }
  });

  it("is read by every tab of the profile", async () => {
    withStorage(memoryStorage());
    await createSignOutNotes().leave("ended:abc");
    await expect(createSignOutNotes().read()).resolves.toBe("ended:abc");
  });

  it("keeps nothing and throws nothing where the storage is blocked", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    const notes = createSignOutNotes();
    await expect(notes.leave("ended:abc")).resolves.toBeUndefined();
    await expect(notes.read()).resolves.toBeNull();
  });

  it("keeps nothing and throws nothing where the storage refuses a write", async () => {
    withStorage({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    const notes = createSignOutNotes();
    await expect(notes.leave("ended:abc")).resolves.toBeUndefined();
    await expect(notes.read()).resolves.toBeNull();
  });
});
