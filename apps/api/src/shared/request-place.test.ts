import { describe, expect, it } from "vitest";

import { requestPlace, UNKNOWN_PLACE, unknownRequestPlaceReader } from "./request-place.ts";

describe("requestPlace", () => {
  it("has no provenance when no host reader was configured", () => {
    const request = new Request("https://pace-api.test/api/auth/nonce", {
      headers: { "CF-Connecting-IP": "untrusted", "User-Agent": "untrusted" },
    });
    expect(requestPlace(request, unknownRequestPlaceReader)).toEqual({
      city: null,
      country: null,
      ip: null,
      userAgent: null,
    });
  });
  it("uses the injected reader with this request instead of interpreting platform data", () => {
    const request = new Request("https://pace-api.test/api/auth/nonce", {
      headers: { "User-Agent": "ignored by the injected reader" },
    });
    const reader = {
      read: (input: Request) => ({ ...UNKNOWN_PLACE, city: new URL(input.url).hostname }),
    };
    expect(requestPlace(request, reader)).toEqual({
      city: "pace-api.test",
      country: null,
      ip: null,
      userAgent: null,
    });
  });
});
