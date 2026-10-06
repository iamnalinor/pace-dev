/**
 * `bun db:check`: fails when the schema has changed without a migration.
 * drizzle-kit has no dry run, so we generate into a throwaway copy of the
 * migrations folder and look for new files — the real folder is never touched.
 */
import { $ } from "bun";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MIGRATIONS = path.join(import.meta.dir, "../../drizzle");
const scratch = await mkdtemp(path.join(tmpdir(), "drizzle-check-"));

// drizzle-kit only understands an `out` relative to the working directory.
const environment = { ...Bun.env, DRIZZLE_OUT: path.relative(process.cwd(), scratch) };

try {
  await cp(MIGRATIONS, scratch, { recursive: true });
  await $`drizzle-kit check`.env(environment).quiet();
  const before = new Set(await readdir(scratch));
  await $`drizzle-kit generate --name=drift-check`.env(environment).quiet();
  const after = await readdir(scratch);
  const added = after.filter((file) => !before.has(file));
  if (added.length > 0) {
    console.error(
      "The Drizzle schema has changes without a migration. Run `bun db:generate --name=<what-changed>`.",
    );
    process.exit(1);
  }
  console.log("Migrations are in sync with the schema.");
} finally {
  await rm(scratch, { force: true, recursive: true });
}
