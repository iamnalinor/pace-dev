import {
  clearPendingBotLogin,
  readPendingBotLogin,
  savePendingBotLogin,
} from "./bot-login-pending.web.ts";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      removeItem: (key: string) => memory.delete(key),
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
});

describe("pending bot login on the web", () => {
  it("restores the nonce and remaining lifetime after a page reload", () => {
    savePendingBotLogin({ expiresAt: 5000, nonce: "abc" });
    expect(readPendingBotLogin(3000)).toEqual({ expiresAt: 5000, nonce: "abc" });
  });

  it("forgets expired, invalid and cancelled attempts", () => {
    savePendingBotLogin({ expiresAt: 5000, nonce: "abc" });
    expect(readPendingBotLogin(5000)).toBeNull();
    savePendingBotLogin({ expiresAt: 9000, nonce: "xyz" });
    clearPendingBotLogin();
    expect(readPendingBotLogin(3000)).toBeNull();
    memory.set("pace.bot-login", "not-json");
    expect(readPendingBotLogin(3000)).toBeNull();
  });
});
