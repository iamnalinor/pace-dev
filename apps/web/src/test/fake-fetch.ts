import { vi } from "vitest";

export type FakeRoute = (request: {
  readonly url: URL;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
}) => { readonly status?: number; readonly body: unknown } | Promise<{ readonly status?: number; readonly body: unknown }>;

export const TEST_USER = {
  id: "user-1",
  name: "Dev 1919230638",
  photoUrl: null,
  telegramId: "1919230638",
  username: null,
} as const;

/** Routes keyed as `"POST /api/auth/dev"`; unknown routes answer 404 with an API problem body. */
export const createFakeFetch = (routes: Readonly<Record<string, FakeRoute>>) => {
  const calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetchFn = vi.fn(async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const headers = { ...(init.headers as Record<string, string>) };
    calls.push({ body, headers, method, path: url.pathname });
    const route = routes[`${method} ${url.pathname}`];
    if (route === undefined) {
      return Response.json({ code: "not-found", message: "Not found" }, { status: 404 });
    }
    const result = await route({ body, headers, url });
    return Response.json(result.body, { status: result.status ?? 200 });
  });
  return { calls, fetch: fetchFn };
};

/** The routes a signed-in shell touches: dev login, me, logout and an empty sync. */
export const defaultRoutes = (): Record<string, FakeRoute> => ({
  "GET /api/me": () => ({ body: TEST_USER }),
  "GET /api/sync/pull": () => ({ body: { events: [], more: false, seq: 0 } }),
  "POST /api/auth/dev": ({ body }) => {
    const telegramId = (body as { telegramId: string }).telegramId;
    return { body: { token: `tok-${telegramId}`, user: { ...TEST_USER, telegramId } } };
  },
  "POST /api/auth/logout": () => ({ body: { ok: true } }),
  "POST /api/sync/push": ({ body }) => {
    const events = (body as { events: { id: string }[] }).events;
    return { body: { accepted: events.map((event) => event.id), rejected: [], seq: 1 } };
  },
});
