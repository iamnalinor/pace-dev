# Database migrations

The source of truth is the TypeScript schema: `apps/api/src/shared/db/schema.ts`
re-exports every table (better-auth's and each feature's). Migrations are **generated
SQL files, committed and reviewed like code**, in `apps/api/drizzle/`.

## Everyday workflow

1. Change a table (e.g. `features/<name>/infrastructure/<name>-table.ts`), or add a new
   one and export it from `shared/db/schema.ts`.
2. Generate the migration:

   ```sh
   bun db:generate --name=add-bookmarks
   ```

   This writes `apps/api/drizzle/NNNN_add-bookmarks.sql` plus a snapshot in `drizzle/meta/`.
3. **Read the SQL.** drizzle-kit may ask interactively whether a column was renamed or
   dropped-and-added — answer carefully, data depends on it.
4. Restart the API (or `bun db:migrate`). Commit the schema change, the SQL file and
   the `meta/` changes together.

## Applying migrations

- **Automatically on startup, up to the latest version.** `src/main.ts` runs
  `runMigrations()` before the server starts listening, so the API never serves
  traffic on an outdated schema. Several replicas starting at once are safe: a
  PostgreSQL advisory lock serializes them and already-applied migrations are skipped
  (covered by `migrations.int.test.ts`).
- **Manually:** `bun db:migrate` (reads `DATABASE_URL` from `.env`).
- Tests use the very same migrations: the integration preload and the e2e API both
  migrate an empty database before running.

Applied migrations are recorded in the `drizzle.__drizzle_migrations` table.

## Custom SQL (data migrations, extensions, triggers)

```sh
bunx drizzle-kit generate --custom --name=backfill-display-names   # from apps/api
```

creates an empty SQL file in the sequence for you to fill in.

## Rolling back: roll forward

Drizzle has no down migrations, and that is a feature: down migrations are rarely
tested and usually lose data. To undo a change, change the schema back and generate a
**new** migration. For zero-downtime deploys, use expand → migrate → contract:

1. **Expand:** add the new column/table (nullable or with a default); deploy code that
   writes both the old and the new shapes.
2. **Migrate** existing data (custom SQL migration or a script).
3. **Contract:** deploy code that reads only the new shape, then a migration that drops the old one.

Never edit a migration that has been applied anywhere outside your machine.

## Checks in `bun lint` / CI

`bun db:check` (part of `bun lint`, so also the pre-commit hook and CI) runs
`drizzle-kit check` (the migration history is consistent) and then `drizzle-kit generate`
into a **throwaway copy** of `drizzle/`: if that produces a new migration, the schema
changed without one and the check fails. Your real `drizzle/` folder is never touched.
Forgetting to generate a migration cannot reach `main`.

## Merge conflicts between branches

Two branches that both generated migration `0005_*` conflict in `drizzle/meta/_journal.json`.
Resolve by keeping `main`'s version of `drizzle/`, deleting your branch's generated
migration files, and running `bun db:generate` again on top.

## Note on docs

The Drizzle website defaults to the v1 docs. This template uses **drizzle-orm 0.45 /
drizzle-kit 0.31**; read the 0.x documentation.
