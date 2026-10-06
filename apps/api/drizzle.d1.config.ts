import { defineConfig } from "drizzle-kit";

/** Global tables (users, sessions, login nonces) live in D1. */
export default defineConfig({
  casing: "snake_case",
  dialect: "sqlite",
  migrations: { prefix: "index" },
  out: process.env["DRIZZLE_OUT_D1"] ?? "./drizzle/d1",
  schema: "./src/shared/db/d1-schema.ts",
  strict: true,
  verbose: true,
});
