import { err, ok, type Result } from "./result.ts";

/** Why an address the person typed cannot be a server: not a web address, or plain http in public. */
export type ServerUrlError = "insecure" | "invalid-url";

const SCHEME_PREFIX = /^[a-z][\d+.a-z-]*:\/\//iu;

/** Hosts that never leave this machine or the emulator (10.0.2.2 is the Android emulator's host). */
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- fixed development addresses where plain http is allowed, not a server to call
const LOCAL_HOSTS = new Set(["10.0.2.2", "127.0.0.1", "localhost"]);

/** The octets of a dotted IPv4 address, or null for a name. */
const ipv4Of = (host: string): null | readonly number[] => {
  const parts = host.split(".");
  return parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))
    ? null
    : parts.map(Number);
};

/** 10/8, 172.16/12 and 192.168/16: a home or office network, where a dev server has no certificate. */
const isPrivateIpv4 = (host: string): boolean => {
  const octets = ipv4Of(host);
  if (octets === null) {
    return false;
  }
  const [first = 0, second = 0] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

/** The typed text as a URL (a bare host as https), or null when it is none. */
const parseUrl = (text: string): null | URL => {
  try {
    return new URL(SCHEME_PREFIX.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
};

/** A web address of a host and nothing personal in it (credentials in a server address are refused). */
const isServerAddress = (url: URL): boolean =>
  (url.protocol === "https:" || url.protocol === "http:") &&
  url.hostname !== "" &&
  url.username === "" &&
  url.password === "";

/** Plain http only where a development server runs: anywhere else a token would travel in the clear. */
const isInsecure = (url: URL): boolean =>
  url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname) && !isPrivateIpv4(url.hostname);

/**
The server's origin (`https://host[:port]`) from what the person typed: a bare host means https,
a path is dropped. Plain http is allowed only where a development server runs (this machine, the
emulator's host, a private network).
*/
export const normalizeServerUrl = (text: string): Result<string, ServerUrlError> => {
  const trimmed = text.trim();
  const url = trimmed === "" ? null : parseUrl(trimmed);
  if (url === null || !isServerAddress(url)) {
    return err("invalid-url");
  }
  return isInsecure(url) ? err("insecure") : ok(url.origin);
};
