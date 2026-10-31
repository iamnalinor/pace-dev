/** Where a request came from, as far as Cloudflare and the client tell: each part may be unknown. */
export type RequestPlace = {
  readonly ip: null | string;
  readonly country: null | string;
  readonly city: null | string;
  readonly userAgent: null | string;
};

/** A request nothing is known about: an agent's token made in Settings, a test without headers. */
export const UNKNOWN_PLACE: RequestPlace = { city: null, country: null, ip: null, userAgent: null };

const text = (value: unknown): null | string =>
  typeof value === "string" && value !== "" ? value : null;

/**
Reads a request's place: the address from `CF-Connecting-IP` (set by Cloudflare itself, so a
client cannot forge it), country and city from Cloudflare's `request.cf` (absent locally and in
tests unless given), and the User-Agent.
*/
export const requestPlace = (request: Request): RequestPlace => {
  const cf: Readonly<Record<string, unknown>> = request.cf ?? {};
  return {
    city: text(cf["city"]),
    country: text(cf["country"]),
    ip: text(request.headers.get("CF-Connecting-IP")),
    userAgent: text(request.headers.get("User-Agent")),
  };
};
