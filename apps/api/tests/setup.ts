import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vitest";

// The D1 binding starts empty in every test file: apply the committed migrations.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

/**
Every signed-in user has a Telegram chat (their own, by default), so any store with something
due arms its alarm and a firing alarm sends to the Telegram API. In tests that API is
`https://telegram.test` (vitest.config.ts), which does not resolve: answer it here as Telegram
would, so an alarm never hangs a store. Tests that look at what was sent pass their own target.
*/
const TELEGRAM_TEST_ORIGIN = "https://telegram.test";
const realFetch = globalThis.fetch;
vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  return url.startsWith(TELEGRAM_TEST_ORIGIN)
    ? Response.json({ ok: true, result: { message_id: 1 } })
    : await realFetch(input, init);
});
