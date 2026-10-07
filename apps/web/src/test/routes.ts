import type { FakeRoute } from "@pace/client/testing";

export const TEST_USER = {
  id: "user-1",
  name: "Dev 1919230638",
  photoUrl: null,
  telegramId: "1919230638",
  username: null,
} as const;

/** The routes a signed-in shell touches: dev login, me, logout and an empty sync. */
export const defaultRoutes = (): Record<string, FakeRoute> => ({
  "GET /api/me": () => TEST_USER,
  "GET /api/sync/pull": () => ({ events: [], more: false, seq: 0 }),
  "POST /api/auth/dev": ({ body }) => {
    const telegramId = (body as { telegramId: string }).telegramId;
    return { token: `tok-${telegramId}`, user: { ...TEST_USER, telegramId } };
  },
  "POST /api/auth/logout": () => ({ ok: true }),
  "POST /api/sync/push": ({ body }) => {
    const events = (body as { events: { id: string }[] }).events;
    return { accepted: events.map((event) => event.id), rejected: [], seq: 1 };
  },
});
