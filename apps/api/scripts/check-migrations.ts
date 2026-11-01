import { $ } from "bun";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
Fails when the schema changed without a migration: regenerates both migration sets
into a temp directory and compares the SQL with what is committed. Run by `bun lint`.
*/
const configs = [
  { committed: "drizzle/d1", config: "drizzle.d1.config.ts", env: "DRIZZLE_OUT_D1" },
  { committed: "drizzle/do", config: "drizzle.do.config.ts", env: "DRIZZLE_OUT_DO" },
] as const;

const sqlFiles = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .toSorted((a, b) => a.localeCompare(b));

const sqlContents = (dir: string): string =>
  sqlFiles(dir)
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n");

const cwd = path.join(import.meta.dir, "..");
let isFailed = false;
for (const { committed, config, env } of configs) {
  const out = mkdtempSync(path.join(tmpdir(), "pace-drizzle-"));
  try {
    await $`cp -r ${path.join(cwd, committed)}/. ${out}/`.quiet();
    await $`bunx drizzle-kit generate --config ${config}`
      .cwd(cwd)
      .env({ ...process.env, [env]: out })
      .quiet();
    const before = sqlFiles(path.join(cwd, committed));
    const after = sqlFiles(out);
    if (
      before.length !== after.length ||
      sqlContents(path.join(cwd, committed)) !== sqlContents(out)
    ) {
      console.error(`${committed}: schema changed without a migration. Run: bun db:generate`);
      isFailed = true;
    }
  } finally {
    rmSync(out, { force: true, recursive: true });
  }
}
/*
A destructive statement (dropping or renaming a table or column) in the release that stops using it
takes the API down between `deploy.yml`'s migrate step and the new Worker, and makes a rollback
impossible (the review of 0008). Expand, then contract: a later release drops what an earlier one
stopped using, and says so with a `-- contract: <what stopped using it, and when>` line.
*/
const DESTRUCTIVE = /\b(?:DROP\s+(?:TABLE|COLUMN)|RENAME\s+(?:TO|COLUMN))\b/iu;
const CONTRACT = /^--\s*contract:\s*\S/mu;
for (const { committed } of configs) {
  const names = sqlFiles(path.join(cwd, committed));
  for (const name of names) {
    const sql = readFileSync(path.join(cwd, committed, name), "utf8");
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    if (!DESTRUCTIVE.test(statements) || CONTRACT.test(sql)) {
      continue;
    }

    console.error(
      `${committed}/${name}: drops or renames a table or column. Ship it in a later release than the code that stopped using it and mark it "-- contract: <reason>" (docs/architecture.md, "Auth and sessions").`,
    );
    isFailed = true;
  }
}
if (isFailed) {
  process.exit(1);
}
console.log("migrations in sync");
