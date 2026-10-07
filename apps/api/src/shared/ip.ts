import { err, ok, type Result } from "@pace/core";

/** A parsed `a.b.c.d/n`: `base` is the network address (host bits cleared), `bits` the prefix length. */
export type Cidr = {
  readonly base: number;
  readonly bits: number;
};

const OCTET_COUNT = 4;
const OCTET_RADIX = 256;
const ADDRESS_BITS = 32;
// Strict decimal: no leading zeros (octal ambiguity), no sign, no whitespace.
const DECIMAL = /^(?:0|[1-9]\d*)$/;

const parseDecimal = (text: string, max: number): null | number => {
  if (!DECIMAL.test(text)) {
    return null;
  }
  const value = Number(text);
  return value > max ? null : value;
};

/** Dotted-quad IPv4 → unsigned 32-bit number; IPv6, hostnames and malformed text give `null`. */
export const parseIpv4 = (text: string): null | number => {
  const parts = text.split(".");
  if (parts.length !== OCTET_COUNT) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    const octet = parseDecimal(part, OCTET_RADIX - 1);
    if (octet === null) {
      return null;
    }
    value = value * OCTET_RADIX + octet;
  }
  return value;
};

/** Addresses in a block with this prefix length. */
const blockSize = (bits: number): number => 2 ** (ADDRESS_BITS - bits);

/** The network address of the block that contains `ip` (host bits cleared). */
const networkOf = (ip: number, bits: number): number => ip - (ip % blockSize(bits));

/**
Reads `a.b.c.d/n` (IPv4 only, `n` in 0–32). Host bits are cleared, so `1.2.3.4/24`
means `1.2.3.0/24`. The error quotes the input so a config typo is easy to find.
*/
export const parseCidr = (text: string): Result<Cidr, string> => {
  const [address, prefix, ...rest] = text.split("/");
  if (address === undefined || prefix === undefined || rest.length > 0) {
    return err(`"${text}" is not in a.b.c.d/n form`);
  }
  const ip = parseIpv4(address);
  if (ip === null) {
    return err(`"${text}" does not start with an IPv4 address`);
  }
  const bits = parseDecimal(prefix, ADDRESS_BITS);
  return bits === null
    ? err(`"${text}" needs a prefix length between 0 and 32`)
    : ok({ base: networkOf(ip, bits), bits });
};

/**
Whether `ip` (an IPv4 text) falls into any of the CIDRs. An IPv6 or malformed address
never matches, even against `0.0.0.0/0`; an entry that does not parse matches nothing.
*/
export const isIpInCidrs = (ip: string, cidrs: readonly string[]): boolean => {
  const address = parseIpv4(ip);
  if (address === null) {
    return false;
  }
  return cidrs.some((cidr) => {
    const parsed = parseCidr(cidr);
    return parsed.ok && networkOf(address, parsed.value.bits) === parsed.value.base;
  });
};
