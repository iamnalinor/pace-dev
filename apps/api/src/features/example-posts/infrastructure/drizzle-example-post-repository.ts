import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../../../shared/db/client.ts";
import type { ExamplePostRepository } from "../application/example-post-repository.ts";
import type { ExamplePost, ExamplePostBody } from "../domain/example-post.ts";

import { user } from "../../../auth/auth-schema.ts";
import { exampleLikes, examplePosts } from "./example-posts-table.ts";

type ExamplePostRow = typeof examplePosts.$inferSelect;

// The database enforces the body invariant (check constraint): a stored body is a valid body.
const toExamplePost = (row: ExamplePostRow): ExamplePost => ({
  ...row,
  body: row.body as ExamplePostBody,
});

const likeCountOf = (postId: typeof examplePosts.id) =>
  sql<number>`(select count(*)::int from ${exampleLikes} where ${exampleLikes.postId} = ${postId})`;

const likedBy = (postId: typeof examplePosts.id, userId: string) =>
  sql<boolean>`exists (select 1 from ${exampleLikes} where ${exampleLikes.postId} = ${postId} and ${exampleLikes.userId} = ${userId})`;

const listFeed =
  (db: Database): ExamplePostRepository["listFeed"] =>
  async ({ after, limit, viewerId }) => {
    const rows = await db
      .select({
        authorName: user.name,
        likeCount: likeCountOf(examplePosts.id),
        likedByMe: likedBy(examplePosts.id, viewerId),
        post: examplePosts,
      })
      .from(examplePosts)
      .innerJoin(user, eq(user.id, examplePosts.authorId))
      .where(
        after === undefined
          ? undefined
          : // Row comparison matches the (created_at desc, id desc) index exactly.
            sql`(${examplePosts.createdAt}, ${examplePosts.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`,
      )
      .orderBy(desc(examplePosts.createdAt), desc(examplePosts.id))
      .limit(limit);
    return rows.map((row) => ({
      author: { id: row.post.authorId, name: row.authorName },
      likeCount: row.likeCount,
      likedByMe: row.likedByMe,
      post: toExamplePost(row.post),
    }));
  };

const setLike =
  (db: Database): ExamplePostRepository["setLike"] =>
  async ({ liked, postId, userId }) => {
    if (!liked) {
      await db
        .delete(exampleLikes)
        .where(and(eq(exampleLikes.postId, postId), eq(exampleLikes.userId, userId)));
      return;
    }
    // INSERT ... SELECT: if the post was deleted concurrently, nothing is inserted
    // (instead of a foreign-key violation). ON CONFLICT makes repeated likes a no-op.
    await db
      .insert(exampleLikes)
      .select(
        db
          // Drizzle requires the selected fields in table column order.
          .select({
            userId: sql`${userId}`.as("user_id"),
            postId: examplePosts.id,
            createdAt: sql`now()`.as("created_at"),
          })
          .from(examplePosts)
          .where(eq(examplePosts.id, postId)),
      )
      .onConflictDoNothing();
  };

export const createDrizzleExamplePostRepository = (db: Database): ExamplePostRepository => ({
  delete: async (postId) => {
    await db.delete(examplePosts).where(eq(examplePosts.id, postId));
  },
  findById: async (postId) => {
    const [row] = await db.select().from(examplePosts).where(eq(examplePosts.id, postId));
    return row === undefined ? undefined : toExamplePost(row);
  },
  getLikeState: async (postId, userId) => {
    const [row] = await db
      .select({
        likeCount: likeCountOf(examplePosts.id),
        likedByMe: likedBy(examplePosts.id, userId),
      })
      .from(examplePosts)
      .where(eq(examplePosts.id, postId));
    return row ?? { likeCount: 0, likedByMe: false };
  },
  insert: async (input) => {
    const [row] = await db.insert(examplePosts).values(input).returning();
    if (row === undefined) {
      throw new Error("INSERT ... RETURNING returned no row");
    }
    return toExamplePost(row);
  },
  listFeed: listFeed(db),
  setLike: setLike(db),
});
