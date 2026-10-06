import type { Event } from "@pace/core";

/** One fake route: returns a JSON body (or a full `Response`) for `METHOD /path`. */
export type FakeRoute = (request: { readonly body: unknown; readonly url: URL }) => unknown;

export type FakeCall = { readonly body: unknown; readonly method: string; readonly path: string };

export const createFakeFetch = (
  routes: Readonly<Record<string, FakeRoute>>,
): {
  readonly calls: FakeCall[];
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>;
} => {
  const calls: FakeCall[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      const url = new URL(input);
      const method = init.method ?? "GET";
      const body: unknown = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ body, method, path: url.pathname });
      const route = routes[`${method} ${url.pathname}`];
      if (route === undefined) {
        return Response.json({ code: "not-found", message: "No route" }, { status: 404 });
      }
      const result = await route({ body, url });
      return result instanceof Response ? result : Response.json(result);
    },
  };
};

export const problem = (status: number, code: string): Response =>
  Response.json({ code, message: code }, { status });

export const at = (hour: number, minute = 0): string =>
  `2026-10-06T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;

export const settingsEvent = (
  id: string,
  occurredAt: string,
  payload: { readonly language?: "en" | "ru"; readonly timezone?: string },
): Event => ({
  deviceId: "remote",
  id,
  occurredAt,
  payload,
  precision: "exact",
  recordedAt: occurredAt,
  source: "web",
  type: "settings.updated",
});

export const user = { id: "u1", name: "Ann", photoUrl: null, telegramId: "1", username: null };
