import { treaty } from "@elysiajs/eden";
import { sql } from "drizzle-orm";

import { type App, createApp } from "../../src/app.ts";
import { createAuth } from "../../src/auth/auth.ts";
import { type Clock, systemClock } from "../../src/shared/clock.ts";
import { createDatabase } from "../../src/shared/db/client.ts";
import { createLogger, type Logger } from "../../src/shared/logger.ts";

// better-auth rejects state-changing requests whose Origin is not trusted (CSRF
// protection). Browsers send Origin automatically; test clients send this one.
const ORIGIN = "http://localhost:3000";

const databaseUrl = (): string => {
  const url = Bun.env["INTEGRATION_DATABASE_URL"];
  if (url === undefined) {
    throw new Error(
      "Run integration tests via `bun test:integration` (the preload starts PostgreSQL)",
    );
  }
  return url;
};

export type TestUser = {
  readonly api: ReturnType<typeof treaty<App>>["api"];
  readonly cookie: string;
  readonly id: string;
  readonly name: string;
};

/**
 * A real API server on a random port, backed by the real (migrated) database,
 * with real better-auth. Tests talk to it over HTTP through the same Eden client
 * the web app uses.
 */
export const startTestApp = async (
  options: { readonly clock?: Clock; readonly logger?: Logger } = {},
) => {
  const database = createDatabase(databaseUrl());
  const auth = createAuth({ baseUrl: ORIGIN, db: database.db, secret: "x".repeat(32) });
  const app = createApp({
    auth,
    clock: options.clock ?? systemClock,
    db: database.db,
    exposeApiDocs: true,
    logger: options.logger ?? createLogger("error"),
    trustedOrigin: ORIGIN,
  }).listen(0);
  const baseUrl = `http://localhost:${String(app.server?.port)}`;

  const client = (headers: Record<string, string> = {}) =>
    treaty<App>(baseUrl, { headers: { origin: ORIGIN, ...headers }, parseDate: false }).api;

  const fetchAuth = async (path: string, body: object, cookie = ""): Promise<Response> =>
    await fetch(`${baseUrl}/api/auth${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", cookie, origin: ORIGIN },
      method: "POST",
    });

  const signUp = async (name: string): Promise<TestUser> => {
    const response = await fetchAuth("/sign-up/email", {
      email: `${name.toLowerCase()}-${crypto.randomUUID()}@mail.test`,
      name,
      password: "correct horse battery staple",
    });
    if (!response.ok) {
      throw new Error(`sign-up failed: ${String(response.status)} ${await response.text()}`);
    }
    const body = (await response.json()) as { user: { id: string } };
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(";", 1)[0])
      .join("; ");
    return { api: client({ cookie }), cookie, id: body.user.id, name };
  };

  return {
    anonymous: client(),
    /** Simulates losing the database while the API keeps serving requests. */
    breakDatabase: database.close,
    baseUrl,
    fetchAuth,
    signUp,
    /** Empties every application table (keeps the migrations journal). */
    truncate: async (): Promise<void> => {
      await database.db.execute(sql`
        do $$ declare tables text; begin
          select string_agg(format('%I', tablename), ', ') into tables
          from pg_tables where schemaname = 'public';
          if tables is not null then execute 'truncate ' || tables || ' cascade'; end if;
        end $$`);
    },
    stop: async (): Promise<void> => {
      // `true` closes keep-alive connections too. Otherwise the next test app may get
      // the same port and fetch would reuse a pooled connection to THIS (stopped) server.
      await app.stop(true);
      await database.close();
    },
  };
};

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;
