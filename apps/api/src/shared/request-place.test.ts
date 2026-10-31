import { describe, expect, it } from "vitest";

import { requestPlace } from "./request-place.ts";

const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";

describe("requestPlace", () => {
  it("reads the address Cloudflare saw, its country and city, and the User-Agent", () => {
    const request = new Request("https://pace-api.test/api/auth/nonce", {
      cf: { city: "Berlin", country: "DE" },
      // eslint-disable-next-line sonarjs/no-hardcoded-ip -- the address Cloudflare reported is a fixture
      headers: { "CF-Connecting-IP": "1.2.3.4", "User-Agent": USER_AGENT },
    });
    expect(requestPlace(request)).toEqual({
      city: "Berlin",
      country: "DE",
      // eslint-disable-next-line sonarjs/no-hardcoded-ip -- the same fixture, read back
      ip: "1.2.3.4",
      userAgent: USER_AGENT,
    });
  });

  it("is all nulls when nothing is known (no Cloudflare data, no headers)", () => {
    expect(requestPlace(new Request("https://pace-api.test/api/auth/nonce"))).toEqual({
      city: null,
      country: null,
      ip: null,
      userAgent: null,
    });
  });

  it("keeps at most 512 characters of a User-Agent: anyone may send one, it is stored", () => {
    const request = new Request("https://pace-api.test/api/auth/nonce", {
      headers: { "User-Agent": "x".repeat(5000) },
    });
    expect(requestPlace(request).userAgent).toBe("x".repeat(512));
  });
});
