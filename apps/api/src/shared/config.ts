import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { err, ok, type Result } from "./result.ts";

const ConfigSchema = Type.Object({
  // Brute-force protection on auth endpoints; only CI smoke runs turn it off.
  AUTH_RATE_LIMIT: Type.Boolean({ default: true }),
  BETTER_AUTH_SECRET: Type.String({ minLength: 32 }),
  BETTER_AUTH_URL: Type.String({ pattern: "^https?://" }),
  DATABASE_URL: Type.String({ pattern: "^postgres(ql)?://" }),
  LOG_LEVEL: Type.Union([Type.Literal("debug"), Type.Literal("info"), Type.Literal("error")], {
    default: "info",
  }),
  NODE_ENV: Type.Union(
    [Type.Literal("development"), Type.Literal("production"), Type.Literal("test")],
    { default: "development" },
  ),
  PORT: Type.Integer({ default: 3000, maximum: 65_535, minimum: 0 }),
});

export type Config = Static<typeof ConfigSchema>;

// The value shipped in .env.example: fine for local development, never for production.
const PLACEHOLDER_SECRET_MARKER = "change-me";

/** One message per variable: TypeBox reports several failures for a single missing value. */
const describeErrors = (value: unknown): readonly string[] => {
  const byVariable = new Map<string, string>();
  for (const error of Value.Errors(ConfigSchema, value)) {
    const name = error.path.slice(1);
    if (!byVariable.has(name)) {
      byVariable.set(name, `${name}: ${error.message}`);
    }
  }
  return byVariable.values().toArray();
};

/**
 * Parses and validates environment variables once, at startup (fail fast).
 * Unknown variables are dropped, defaults applied, strings converted ("3000" → 3000).
 * Returns every problem at once, not just the first one.
 */
export const parseConfig = (
  env: Readonly<Record<string, string | undefined>>,
): Result<Config, readonly string[]> => {
  const prepared = Value.Convert(
    ConfigSchema,
    Value.Default(ConfigSchema, Value.Clean(ConfigSchema, { ...env })),
  );
  if (!Value.Check(ConfigSchema, prepared)) {
    return err(describeErrors(prepared));
  }
  if (
    prepared.NODE_ENV === "production" &&
    prepared.BETTER_AUTH_SECRET.includes(PLACEHOLDER_SECRET_MARKER)
  ) {
    return err([
      "BETTER_AUTH_SECRET: replace the .env.example placeholder (openssl rand -base64 32)",
    ]);
  }
  return ok(prepared);
};
