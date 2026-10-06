import { Elysia } from "elysia";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defense in depth. Browsers always send `Origin` on state-changing requests;
 * a request coming from a page on another origin (a sibling subdomain, another
 * localhost port, …) is rejected even though SameSite=Lax would let the cookie
 * through for same-site pages. Requests without `Origin` (curl, server-to-server)
 * carry no ambient browser credentials risk and are allowed.
 */
export const createOriginGuard = (trustedOrigin: string) =>
  new Elysia().onRequest(({ request, status }) => {
    const origin = request.headers.get("origin");
    if (origin === null || origin === trustedOrigin || SAFE_METHODS.has(request.method)) {
      return;
    }
    return status(403, { code: "csrf/untrusted-origin", message: "Untrusted origin" });
  });
