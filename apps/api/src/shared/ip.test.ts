/* eslint-disable sonarjs/no-hardcoded-ip -- this file tests an IP parser; the addresses are its fixtures */
import { describe, expect, it } from "vitest";

import { isIpInCidrs, parseCidr, parseIpv4 } from "./ip.ts";

/** https://core.telegram.org/bots/webhooks#the-short-version */
const TELEGRAM_CIDRS = ["149.154.160.0/20", "91.108.4.0/22"];
const TELEGRAM_BASE = 2_509_938_688; // 149.154.160.0

describe("parseIpv4", () => {
  it.each([
    ["0.0.0.0", 0],
    ["0.0.0.1", 1],
    ["1.0.0.0", 16_777_216],
    ["149.154.160.0", TELEGRAM_BASE],
    ["255.255.255.255", 4_294_967_295],
  ])("reads %s as the unsigned 32-bit number %i", (text, expected) => {
    expect(parseIpv4(text)).toBe(expected);
  });

  it.each([
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
  ])("rejects %j: not four octets of 0-255", (text) => {
    expect(parseIpv4(text)).toBeNull();
  });
});

describe("parseCidr", () => {
  it.each([
    ["149.154.160.0/20", TELEGRAM_BASE, 20],
    // Host bits are cleared.
    ["149.154.167.220/20", TELEGRAM_BASE, 20],
    ["0.0.0.0/0", 0, 0],
    ["255.255.255.255/0", 0, 0],
    ["8.8.8.8/32", 134_744_072, 32],
  ])("reads %s as base %i with %i bits", (text, base, bits) => {
    expect(parseCidr(text)).toEqual({ ok: true, value: { base, bits } });
  });

  it.each([
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
  ])("rejects %j and quotes it in the error", (text) => {
    const result = parseCidr(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(text);
  });
});

describe("isIpInCidrs", () => {
  it.each([
    "149.154.160.0",
    "149.154.167.220",
    "149.154.175.255",
    "91.108.4.0",
    "91.108.5.17",
    "91.108.7.255",
  ])("matches %s, inside a Telegram range", (ip) => {
    expect(isIpInCidrs(ip, TELEGRAM_CIDRS)).toBe(true);
  });

  it.each([
    "149.154.159.255",
    "149.154.176.0",
    "91.108.3.255",
    "91.108.8.0",
    "8.8.8.8",
    "127.0.0.1",
    "0.0.0.0",
    "255.255.255.255",
  ])("rejects %s, next to or far from the Telegram ranges", (ip) => {
    expect(isIpInCidrs(ip, TELEGRAM_CIDRS)).toBe(false);
  });

  it.each([
    "2a03:2880:f12f:83:face:b00c:0:25de",
    "::1",
    "::ffff:149.154.167.220",
    "",
    "149.154.167",
    "149.154.167.220,8.8.8.8",
    "localhost",
  ])("never matches the IPv6 or malformed %j, even against /0", (ip) => {
    expect(isIpInCidrs(ip, ["0.0.0.0/0"])).toBe(false);
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
/* eslint-enable sonarjs/no-hardcoded-ip -- end of the parser fixtures */
