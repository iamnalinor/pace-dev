import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLocalSessionStore, SESSION_KEY } from "./local-session.ts";

describe("createLocalSessionStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips the token through localStorage", async () => {
    const session = createLocalSessionStore();
    expect(await session.get()).toBeNull();
    await session.set("tok-1");
    expect(await session.get()).toBe("tok-1");
    expect(localStorage.getItem(SESSION_KEY)).toBe("tok-1");
    await session.clear();
    expect(await session.get()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("falls back to memory when localStorage throws (private window)", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const session = createLocalSessionStore();
    await session.set("tok-2");
    expect(await session.get()).toBe("tok-2");
    await session.clear();
    expect(await session.get()).toBeNull();
  });
});
