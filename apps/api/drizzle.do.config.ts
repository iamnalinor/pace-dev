import { defineConfig } from "drizzle-kit";

/** Per-user tables (events, observations, projections, decisions) live in a Durable Object. */
export default defineConfig({
  casing: "snake_case",
  dialect: "sqlite",
  driver: "durable-sqlite",
  migrations: { prefix: "index" },
  out: process.env["DRIZZLE_OUT_DO"] ?? "./drizzle/do",
  schema: "./src/user-store/schema.ts",
  strict: true,
  verbose: true,
});
