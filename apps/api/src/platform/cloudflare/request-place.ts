import type { RequestPlaceReader } from "../../shared/ports/request-place.ts";
import type { RequestPlace } from "../../shared/request-place.ts";

/**
The most of a User-Agent kept: the client sets it freely and an anonymous nonce request stores
it, so its size is bounded; real browsers send well under this.
*/
const USER_AGENT_MAX = 512;

const text = (value: unknown): null | string =>
  typeof value === "string" && value !== "" ? value : null;

/**
Reads a request's place: the address from `CF-Connecting-IP` (set by Cloudflare itself, so a
client cannot forge it), country and city from Cloudflare's `request.cf` (absent locally and in
tests unless given), and the User-Agent.
*/
const read = (request: Request): RequestPlace => {
  const cf: Readonly<Record<string, unknown>> = request.cf ?? {};
  return {
    city: text(cf["city"]),
    country: text(cf["country"]),
    ip: text(request.headers.get("CF-Connecting-IP")),
    userAgent: text(request.headers.get("User-Agent"))?.slice(0, USER_AGENT_MAX) ?? null,
  };
};

export const cloudflareRequestPlaceReader: RequestPlaceReader = { read };
