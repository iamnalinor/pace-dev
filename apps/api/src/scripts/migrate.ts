// Applies pending migrations without starting the API: `bun db:migrate`.
import { runMigrations } from "../shared/db/migrate.ts";

const url = Bun.env["DATABASE_URL"];
if (url === undefined || url === "") {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
await runMigrations(url);
console.log("Migrations applied");
