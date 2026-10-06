import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { Database } from "../shared/db/client.ts";

import * as authSchema from "./auth-schema.ts";

export const AUTH_BASE_PATH = "/api/auth";

export const createAuth = (options: {
  readonly baseUrl: string;
  readonly db: Database;
  readonly rateLimit?: boolean;
  readonly secret: string;
}) =>
  betterAuth({
    basePath: AUTH_BASE_PATH,
    baseURL: options.baseUrl,
    database: drizzleAdapter(options.db, { provider: "pg", schema: authSchema }),
    // Email verification and password reset need an email sender: see docs/architecture.md.
    emailAndPassword: { autoSignIn: true, enabled: true },
    // Defaults to on in production only (better-auth default); an explicit value wins.
    ...(options.rateLimit !== undefined && { rateLimit: { enabled: options.rateLimit } }),
    secret: options.secret,
    telemetry: { enabled: false },
  });

export type Auth = ReturnType<typeof createAuth>;
