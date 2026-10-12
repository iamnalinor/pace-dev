import { afterEach, describe, expect, it, vi } from "vitest";

// Hermes on Android has no `crypto.getRandomValues` until the app installs one: ulidx's browser
// build then throws "Failed to find a reliable PRNG" from `monotonicFactory()`. Under Node it
// always finds `node:crypto`, so the platform without one is played here.
const platform = vi.hoisted(() => ({ hasPrng: true }));

vi.mock(import("ulidx"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    monotonicFactory: (prng?: () => number) => {
      if (prng === undefined && !platform.hasPrng) {
        throw new Error("Failed to find a reliable PRNG");
      }
      return actual.monotonicFactory(prng);
    },
  };
});

afterEach(() => {
  platform.hasPrng = true;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("ids on a platform without a PRNG yet", () => {
  it("loads: the PRNG is looked up at the first id, not on import", async () => {
    platform.hasPrng = false;
    await expect(import("./ids.ts")).resolves.toHaveProperty("newId");
  });

  it("makes ids from the crypto.getRandomValues the app installs later", async () => {
    platform.hasPrng = false;
    vi.stubGlobal("crypto", undefined);
    const { isUlid, newId } = await import("./ids.ts");
    const getRandomValues = vi.fn((array: Uint8Array) => array.fill(42));
    vi.stubGlobal("crypto", { getRandomValues });
    expect(isUlid(newId())).toBe(true);
    expect(getRandomValues).toHaveBeenCalled();
  });
});
