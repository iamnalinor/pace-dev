import { describe, expect, test } from "bun:test";

import { runMigrations } from "../../src/shared/db/migrate.ts";

describe("migrations", () => {
  // The preload already migrated this database to the latest version.
  const url = Bun.env["INTEGRATION_DATABASE_URL"] ?? "";

  test("re-running is a no-op, even from several replicas at once", async () => {
    // Each API replica migrates on startup; the advisory lock must serialize them.
    const runs = Array.from({ length: 3 }, async () => {
      await runMigrations(url);
    });

    expect(await Promise.allSettled(runs)).toEqual(
      Array.from({ length: 3 }, () => ({ status: "fulfilled", value: undefined })),
    );
  });
});
