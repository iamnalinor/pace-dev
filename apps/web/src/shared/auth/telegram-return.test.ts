import { afterEach, describe, expect, it } from "vitest";

import {
  parseTelegramLogin,
  safeReturnPath,
  savePendingTelegramLogin,
  takePendingTelegramLogin,
  telegramAuthUrl,
} from "./telegram-return.ts";

const QUERY =
  "return=%2Flogin&id=1919230638&first_name=%D0%90%D0%BB%D1%8C%D0%B1%D0%B5%D1%80%D1%82&username=nalinor&auth_date=1791350000&hash=abc123";

afterEach(() => {
  sessionStorage.clear();
});

describe("telegram return", () => {
  it("parses the signed fields Telegram appends, numbers included", () => {
    expect(parseTelegramLogin(new URLSearchParams(QUERY))).toEqual({
      auth_date: 1_791_350_000,
      first_name: "Альберт",
      hash: "abc123",
      id: 1_919_230_638,
      username: "nalinor",
    });
  });

  it("rejects a query without the signature", () => {
    expect(parseTelegramLogin(new URLSearchParams("id=1&first_name=A&auth_date=1"))).toBeNull();
    expect(parseTelegramLogin(new URLSearchParams("id=x&first_name=A&auth_date=1&hash=h"))).toBeNull();
  });

  it("only returns to same-origin paths", () => {
    expect(safeReturnPath("/oauth/authorize?client_id=1")).toBe("/oauth/authorize?client_id=1");
    expect(safeReturnPath("//evil.example")).toBe("/login");
    expect(safeReturnPath("https://evil.example")).toBe("/login");
    expect(safeReturnPath(null)).toBe("/login");
  });

  it("builds the auth url that brings the browser back to the current page", () => {
    expect(
      telegramAuthUrl({ origin: "https://pace.test", pathname: "/oauth/authorize", search: "?a=1" }),
    ).toBe("https://pace.test/auth/telegram?return=%2Foauth%2Fauthorize%3Fa%3D1");
  });

  it("hands a stored login over exactly once", () => {
    const login = parseTelegramLogin(new URLSearchParams(QUERY));
    if (login === null) {
      throw new Error("fixture did not parse");
    }
    savePendingTelegramLogin(login);
    expect(takePendingTelegramLogin()).toEqual(login);
    expect(takePendingTelegramLogin()).toBeNull();
  });
});
