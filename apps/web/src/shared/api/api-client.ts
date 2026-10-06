import { treaty } from "@elysiajs/eden";

import type { App } from "@template/api";

/**
 * Typed SDK generated from the backend's `App` type: request/response shapes and
 * error statuses come straight from the Elysia route schemas. Same origin as the
 * page (Vite proxy in dev, nginx in production), so the session cookie just works.
 */
export const api = treaty<App>(globalThis.location.origin, {
  fetch: { credentials: "include" },
  // By default Eden converts ANY date-looking string into a Date — including user
  // content like a post body "2026-01-01T00:00:00Z" — while the type still says string.
  parseDate: false,
}).api;
