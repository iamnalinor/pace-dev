import { createAuthClient } from "better-auth/react";

/**
 * better-auth's own typed client for its endpoints (sign-up, sign-in, session).
 * Same origin as the page; the session lives in an HttpOnly cookie.
 */
export const authClient = createAuthClient({ basePath: "/api/auth" });
