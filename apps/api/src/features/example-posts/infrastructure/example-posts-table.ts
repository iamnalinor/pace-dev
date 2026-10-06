import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../../../auth/auth-schema.ts";
import { EXAMPLE_POST_MAX_LENGTH } from "../domain/example-post.ts";

// Millisecond precision on purpose: JS Date has ms precision, and the feed cursor
// carries a JS Date. With PostgreSQL's default µs precision, rows within the same
// millisecond would be skipped or duplicated on page boundaries.
const timestampMs = (name: string) =>
  timestamp(name, { mode: "date", precision: 3, withTimezone: true });

export const examplePosts = pgTable(
  "example_posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text().notNull(),
    createdAt: timestampMs("created_at").notNull().defaultNow(),
  },
  (table) => [
    // Defense in depth: the domain validates first, the database has the final word.
    check(
      "example_posts_body_length",
      sql`char_length(${table.body}) between 1 and ${sql.raw(String(EXAMPLE_POST_MAX_LENGTH))}`,
    ),
    index("example_posts_feed_idx").on(table.createdAt.desc(), table.id.desc()),
    index("example_posts_author_idx").on(table.authorId),
  ],
);

export const exampleLikes = pgTable(
  "example_likes",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    postId: uuid()
      .notNull()
      .references(() => examplePosts.id, { onDelete: "cascade" }),
    createdAt: timestampMs("created_at").notNull().defaultNow(),
  },
  // Composite primary key: "one like per user per post" is enforced by the database.
  (table) => [
    primaryKey({ columns: [table.userId, table.postId] }),
    index("example_likes_post_idx").on(table.postId),
  ],
);
