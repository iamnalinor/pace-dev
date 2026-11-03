import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
The web build's response headers (Cloudflare's `_headers`, copied into `dist/`): the consent page
grants with a single click on Allow in a signed-in browser, so it must never be framed by another
site (A9 review m2). The e2e server does not apply `_headers`; the deployed check is the owner's
release step in docs/qa.md.
*/
const HEADERS = path.join(import.meta.dir, "../apps/app/public/_headers");

/** The headers of one path rule: `name: value` lines indented under the path. */
const headersFor = (source: string, rule: string): ReadonlyMap<string, string> => {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === rule && !line.startsWith(" "));
  const found = new Map<string, string>();
  const after = lines.slice(start + 1);
  for (const line of after) {
    if (!line.startsWith(" ") || line.trim() === "") {
      break;
    }
    const at = line.indexOf(":");
    found.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
  }
  return found;
};

describe("the web build's anti-framing headers", () => {
  const all = headersFor(readFileSync(HEADERS, "utf8"), "/*");

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
