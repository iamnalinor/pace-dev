import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { headersForPath, parseHeaders, withLocalApi } from "./web-headers.ts";

/**
The web build's response headers (Cloudflare's `_headers`, copied into `dist/`): the consent page
grants with a single click on Allow in a signed-in browser, so it must never be framed by another
site (A9 review m2). The e2e server applies the same file (`serve-web.ts`, F-WEB-16); the deployed
check is the owner's release step in docs/qa.md.
*/
const HEADERS = path.join(import.meta.dir, "../apps/app/public/_headers");

describe("the web build's anti-framing headers", () => {
  const all = headersForPath(parseHeaders(readFileSync(HEADERS, "utf8")), "/settings");

  it("deny framing the legacy way, for old browsers", () => {
    expect(all.get("x-frame-options")).toBe("DENY");
  });

  it("deny framing in the CSP, the standard way", () => {
    const directives = (all.get("content-security-policy") ?? "")
      .split(";")
      .map((part) => part.trim());
    expect(directives).toContain("frame-ancestors 'none'");
  });
});

describe("the headers as the local web server applies them (F-WEB-16)", () => {
  const rules = parseHeaders(readFileSync(HEADERS, "utf8"));

  it("gives every page the policy, and the well-known files their own header on top", () => {
    expect(headersForPath(rules, "/").has("content-security-policy")).toBe(true);
    const wellKnown = headersForPath(rules, "/.well-known/assetlinks.json");
    expect(wellKnown.get("access-control-allow-origin")).toBe("*");
    expect(wellKnown.has("content-security-policy")).toBe(true);
  });

  it("lets the local build reach its local API, over HTTP and the socket, and nothing else", () => {
    const policy = "default-src 'self'; connect-src 'self' https://api.example; img-src 'self'";
    expect(withLocalApi(policy, "http://localhost:8787")).toBe(
      "default-src 'self'; connect-src 'self' https://api.example http://localhost:8787 ws://localhost:8787; img-src 'self'",
    );
    expect(withLocalApi(policy, undefined)).toBe(policy);
  });
});
