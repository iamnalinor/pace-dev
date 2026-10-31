import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/** The migrations up to and including `tag`, in order. */
const upTo = (tag: string) => {
  const end = env.TEST_MIGRATIONS.findIndex((migration) => migration.name.startsWith(tag));
  if (end === -1) {
    throw new Error(`no migration ${tag}`);
  }
  return env.TEST_MIGRATIONS.slice(0, end + 1);
};

const NOW = Date.UTC(2026, 9, 6, 10);

describe("0008: sessions get a kind and a readable name from the label they had", () => {
  it("keeps agents' names and maps the old labels the server wrote", async () => {
    const db = env.MIGRATION_DB;
    await applyD1Migrations(db, upTo("0007_"));
    await db
      .prepare(
        "insert into users (id, telegram_id, name, created_at) values ('u1', '1001', 'Ada', ?)",
      )
      .bind(NOW)
      .run();
    const old = [
      ["s-web", "web", null],
      ["s-android", "android", null],
      ["s-dev", "dev", null],
      ["s-agent", "Work laptop", "usage:write"],
    ] as const;
    await db.batch(
      old.map(([id, label, scope]) =>
        db
          .prepare(
            "insert into sessions (id, user_id, token_hash, label, scope, created_at, expires_at, last_seen_at) values (?, 'u1', ?, ?, ?, ?, ?, ?)",
          )
          .bind(id, `hash-${id}`, label, scope, NOW, NOW + 1, NOW),
      ),
    );

    await applyD1Migrations(db, upTo("0008_"));

    const { results } = await db
      .prepare("select id, kind, name, scope from sessions order by id")
      .all<{ id: string; kind: string; name: string; scope: null | string }>();
    expect(results).toEqual([
      { id: "s-agent", kind: "agent", name: "Work laptop", scope: "usage:write" },
      { id: "s-android", kind: "app", name: "Android", scope: null },
      { id: "s-dev", kind: "dev", name: "Dev login", scope: null },
      { id: "s-web", kind: "browser", name: "Browser", scope: null },
    ]);
  });
});
