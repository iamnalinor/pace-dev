import { defineConfig } from "drizzle-kit";

export default defineConfig({
  casing: "snake_case",
  dialect: "postgresql",
  migrations: { prefix: "index" },
  // DRIZZLE_OUT: only for `bun db:check`, which generates into a throwaway copy.
  out: process.env["DRIZZLE_OUT"] ?? "./drizzle",
  schema: "./src/shared/db/schema.ts",
  strict: true,
  verbose: true,
});
