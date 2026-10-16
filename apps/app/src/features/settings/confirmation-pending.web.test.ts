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

  it("restores an unexpired request and forgets it on terminal status", () => {
    savePendingConfirmation(pending);
    expect(readPendingConfirmation(Date.parse("2029-12-31T00:00:00.000Z"))).toEqual(pending);
    clearPendingConfirmation();
    expect(readPendingConfirmation(Date.parse("2029-12-31T00:00:00.000Z"))).toBeNull();
  });

  it("discards expired and malformed requests", () => {
    savePendingConfirmation(pending);
    expect(readPendingConfirmation(Date.parse(pending.request.expiresAt))).toBeNull();
    memory.set("pace.account-confirmation", "{");
    expect(readPendingConfirmation(0)).toBeNull();
  });
});
