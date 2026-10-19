import {
  clearPendingConfirmation,
  readPendingConfirmation,
  savePendingConfirmation,
} from "./confirmation-pending.web.ts";

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

describe("pending account confirmation on the web", () => {
  const pending = {
    action: "wipe" as const,
    request: { expiresAt: "2030-01-01T00:00:00.000Z", id: "opaque" },
  };

  it("restores a request and forgets it on terminal status", () => {
    savePendingConfirmation(pending);
    expect(readPendingConfirmation()).toEqual(pending);
    clearPendingConfirmation();
    expect(readPendingConfirmation()).toBeNull();
  });

  it("restores a request this clock thinks is over: the server says whether it is (bug class 35)", () => {
    savePendingConfirmation({
      ...pending,
      request: { ...pending.request, expiresAt: "2000-01-01T00:00:00.000Z" },
    });
    expect(readPendingConfirmation()?.request.id).toBe("opaque");
  });

  it("discards a malformed request", () => {
    memory.set("pace.account-confirmation", "{");
    expect(readPendingConfirmation()).toBeNull();
  });
});
