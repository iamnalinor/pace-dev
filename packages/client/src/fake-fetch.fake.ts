import type { Event, User } from "@pace/core";

/** One fake route: returns a JSON body (or a full `Response`) for `METHOD /path`. */
export type FakeRoute = (request: { readonly body: unknown; readonly url: URL }) => unknown;

export type FakeCall = {
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: string;
  readonly path: string;
};

export type FakeFetch = {
  readonly calls: FakeCall[];
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** The paths called so far that start with `prefix`, in order. */
  readonly pathsCalled: (prefix: string) => readonly string[];
};

/** Routes keyed by `METHOD /path`; unknown routes answer 404 with the API's problem shape. */
export const createFakeFetch = (routes: Readonly<Record<string, FakeRoute>>): FakeFetch => {
  const calls: FakeCall[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      const url = new URL(input);
      const method = init.method ?? "GET";
      const body: unknown = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      const headers = Object.fromEntries(new Headers(init.headers));
      calls.push({ body, headers, method, path: url.pathname });
      const route = routes[`${method} ${url.pathname}`];
      if (route === undefined) {
        return Response.json({ code: "not-found", message: "No route" }, { status: 404 });
      }
      const result = await route({ body, url });
      return result instanceof Response ? result : Response.json(result);
    },
    pathsCalled: (prefix) =>
      calls.filter((call) => call.path.startsWith(prefix)).map((call) => call.path),
  };
};

/** The sync routes of an empty server: nothing to pull, everything accepted. */
export const emptySyncRoutes: Readonly<Record<string, FakeRoute>> = {
  "GET /api/sync/pull": () => ({ events: [], more: false, seq: 0 }),
  "POST /api/sync/push": ({ body }) => ({
    accepted: (body as { readonly events: readonly { readonly id: string }[] }).events.map(
      (event) => event.id,
    ),
    rejected: [],
    seq: 0,
  }),
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

export const fakeUser: User = {
  id: "u1",
  name: "Ann",
  photoUrl: null,
  telegramId: "1",
  username: null,
};
