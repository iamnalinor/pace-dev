import { describe, expect, it } from "vitest";

import { returnUrl } from "./login-link.ts";

describe("returnUrl", () => {
  it("leads a login from the app to its App Link and one from a browser to the site", () => {
    expect(returnUrl("https://pace.nalinor.dev", "app")).toBe("https://pace.nalinor.dev/app/login");
    expect(returnUrl("https://pace.nalinor.dev", "web")).toBe("https://pace.nalinor.dev/");
  });

  it("gives no button for a local origin, which Telegram refuses (the reply would fail)", () => {
    expect(returnUrl("http://localhost:5173", "web")).toBeUndefined();
    expect(returnUrl("https://localhost:5173", "app")).toBeUndefined();
    expect(returnUrl("http://127.0.0.1:5173", "app")).toBeUndefined();
  });
});
