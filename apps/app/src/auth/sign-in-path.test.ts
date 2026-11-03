import { signInPathFor } from "./sign-in-path.ts";
import { safeReturnPath } from "./telegram-return.ts";

describe("signInPathFor", () => {
  it("carries the consent page and its whole query as a same-origin next", () => {
    const search = "?client_id=abc&redirect_uri=http%3A%2F%2Flocalhost%3A6274%2Fcb&state=s%26t";
    const path = signInPathFor({ pathname: "/oauth/authorize", search });
    const url = new URL(path, "https://pace.example");
    expect(url.pathname).toBe("/login");
    const next = url.searchParams.get("next");
    expect(next).toBe(`/oauth/authorize${search}`);
    // The login screen's rule for `next` (no open redirect) lets it through unchanged.
    expect(safeReturnPath(next)).toBe(next);
  });
});
