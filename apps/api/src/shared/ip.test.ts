import { describe, expect, it } from "vitest";

import { isIpInCidrs, parseCidr, parseIpv4 } from "./ip.ts";

/** https://core.telegram.org/bots/webhooks#the-short-version */
const TELEGRAM_CIDRS = ["149.154.160.0/20", "91.108.4.0/22"];
const TELEGRAM_BASE = 2_509_938_688; // 149.154.160.0

describe("parseIpv4", () => {
  it("reads a dotted quad into an unsigned 32-bit number", () => {
    expect(parseIpv4("0.0.0.0")).toBe(0);
    expect(parseIpv4("0.0.0.1")).toBe(1);
    expect(parseIpv4("1.0.0.0")).toBe(16_777_216);
    expect(parseIpv4("149.154.160.0")).toBe(TELEGRAM_BASE);
    expect(parseIpv4("255.255.255.255")).toBe(4_294_967_295);
  });

  it("rejects anything that is not exactly four octets of 0-255", () => {
    const malformed = [
      "",
      "1.2.3",
      "1.2.3.4.5",
      "256.1.1.1",
      "1.2.3.-1",
      "01.2.3.4",
      "1.2.3.4 ",
      " 1.2.3.4",
      "1.2..4",
      "a.b.c.d",
      "1.2.3.4/32",
      "2001:db8::1",
      "::ffff:1.2.3.4",
    ];
    for (const text of malformed) {
      expect(parseIpv4(text), text).toBeNull();
    }
  });
});

describe("parseCidr", () => {
  it("reads base and prefix length, clearing the host bits", () => {
    expect(parseCidr("149.154.160.0/20")).toEqual({ ok: true, value: { base: TELEGRAM_BASE, bits: 20 } });
    expect(parseCidr("149.154.167.220/20")).toEqual({
      ok: true,
      value: { base: TELEGRAM_BASE, bits: 20 },
    });
    expect(parseCidr("0.0.0.0/0")).toEqual({ ok: true, value: { base: 0, bits: 0 } });
    expect(parseCidr("255.255.255.255/0")).toEqual({ ok: true, value: { base: 0, bits: 0 } });
    expect(parseCidr("8.8.8.8/32")).toEqual({
      ok: true,
      value: { base: parseIpv4("8.8.8.8"), bits: 32 },
    });
  });

  it("names the offending text in the error", () => {
    const malformed = [
      "149.154.160.0",
      "149.154.160.0/",
      "/20",
      "149.154.160.0/33",
      "149.154.160.0/-1",
      "149.154.160.0/08",
      "149.154.160.0/ 20",
      "149.154.160.0/20/1",
      "149.154.160/20",
      "2001:db8::/32",
      "telegram",
    ];
    for (const text of malformed) {
      const result = parseCidr(text);
      expect(result.ok, text).toBe(false);
      expect(!result.ok && result.error, text).toContain(text);
    }
  });
});

describe("isIpInCidrs", () => {
  it("matches the first and last address of each Telegram range and nothing next to them", () => {
    const inside = ["149.154.160.0", "149.154.167.220", "149.154.175.255", "91.108.4.0", "91.108.5.17", "91.108.7.255"];
    const outside = ["149.154.159.255", "149.154.176.0", "91.108.3.255", "91.108.8.0", "8.8.8.8", "127.0.0.1", "0.0.0.0", "255.255.255.255"];
    for (const ip of inside) {
      expect(isIpInCidrs(ip, TELEGRAM_CIDRS), ip).toBe(true);
    }
    for (const ip of outside) {
      expect(isIpInCidrs(ip, TELEGRAM_CIDRS), ip).toBe(false);
    }
  });

  it("never matches an IPv6 or malformed address, even against /0", () => {
    const addresses = ["2a03:2880:f12f:83:face:b00c:0:25de", "::1", "::ffff:149.154.167.220", "", "149.154.167", "149.154.167.220,8.8.8.8", "localhost"];
    for (const ip of addresses) {
      expect(isIpInCidrs(ip, ["0.0.0.0/0"]), ip).toBe(false);
    }
  });

  it("treats /0 as every IPv4 address and /32 as a single one", () => {
    expect(isIpInCidrs("0.0.0.0", ["0.0.0.0/0"])).toBe(true);
    expect(isIpInCidrs("8.8.8.8", ["0.0.0.0/0"])).toBe(true);
    expect(isIpInCidrs("255.255.255.255", ["0.0.0.0/0"])).toBe(true);
    expect(isIpInCidrs("8.8.8.8", ["8.8.8.8/32"])).toBe(true);
    expect(isIpInCidrs("8.8.8.7", ["8.8.8.8/32"])).toBe(false);
    expect(isIpInCidrs("8.8.8.9", ["8.8.8.8/32"])).toBe(false);
  });

  it("matches nothing against an empty list and skips entries that do not parse", () => {
    expect(isIpInCidrs("149.154.167.220", [])).toBe(false);
    expect(isIpInCidrs("8.8.8.8", ["bogus", "8.8.8.8/32"])).toBe(true);
    expect(isIpInCidrs("1.1.1.1", ["bogus", "8.8.8.8/32"])).toBe(false);
  });
});
