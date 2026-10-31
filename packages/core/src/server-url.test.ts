/* eslint-disable sonarjs/no-clear-text-protocols, unicorn/prefer-https -- this file tests the check that refuses plain http; the addresses are its fixtures */
import { describe, expect, it } from "vitest";

import { err, ok } from "./result.ts";
import { normalizeServerUrl } from "./server-url.ts";

describe("normalizeServerUrl", () => {
  it("reads a bare host as https and keeps only the origin", () => {
    expect(normalizeServerUrl("pace.example.dev")).toEqual(ok("https://pace.example.dev"));
    expect(normalizeServerUrl("https://pace.example.dev/api/")).toEqual(
      ok("https://pace.example.dev"),
    );
    expect(normalizeServerUrl("  Pace.Example.dev:8443  ")).toEqual(
      ok("https://pace.example.dev:8443"),
    );
  });

  it("refuses plain http on a public host", () => {
    expect(normalizeServerUrl("http://pace.example.dev")).toEqual(err("insecure"));
    expect(normalizeServerUrl("http://8.8.8.8")).toEqual(err("insecure"));
    expect(normalizeServerUrl("http://172.32.0.1")).toEqual(err("insecure"));
  });

  it("allows plain http on this machine, the emulator's host and private networks", () => {
    for (const url of [
      "http://10.0.2.2:8787",
      "http://192.168.1.5:8787",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "http://10.1.2.3",
      "http://172.16.0.1",
      "http://172.31.255.254",
    ]) {
      expect(normalizeServerUrl(url)).toEqual(ok(url));
    }
  });

  it("refuses what is not a web address", () => {
    expect(normalizeServerUrl("ftp://x")).toEqual(err("invalid-url"));
    expect(normalizeServerUrl("")).toEqual(err("invalid-url"));
    expect(normalizeServerUrl(" ".repeat(3))).toEqual(err("invalid-url"));
    expect(normalizeServerUrl("not a url")).toEqual(err("invalid-url"));
    expect(normalizeServerUrl("https://")).toEqual(err("invalid-url"));
    expect(normalizeServerUrl("https://user:pass@pace.example.dev")).toEqual(err("invalid-url"));
  });
});
/* eslint-enable sonarjs/no-clear-text-protocols, unicorn/prefer-https -- end of the fixtures */
