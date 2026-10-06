import type { ExamplePost } from "../domain/example-post.ts";
import type { ExamplePostRepository } from "./example-post-repository.ts";

const likeKey = (postId: string, userId: string): string => `${postId}:${userId}`;

/**
 * In-memory implementation of the port for use-case unit tests. Deliberately
 * simple: the real ordering/pagination semantics are covered by integration tests
 * against PostgreSQL.
 */
export const createFakeExamplePostRepository = (
  initial: readonly ExamplePost[] = [],
): ExamplePostRepository & { readonly posts: () => readonly ExamplePost[] } => {
  // eslint-disable-next-line functional/no-let -- a fake store is mutable by nature
  let posts = [...initial];
  // eslint-disable-next-line functional/no-let -- a fake store is mutable by nature
  let likes: readonly string[] = [];
  return {
    delete: async (postId) => {
      posts = posts.filter((post) => post.id !== postId);
    },
    findById: async (postId) => posts.find((post) => post.id === postId),
    getLikeState: async (postId, userId) => ({
      likeCount: likes.filter((key) => key.startsWith(`${postId}:`)).length,
      likedByMe: likes.includes(likeKey(postId, userId)),
    }),
    insert: async (input) => {
      const post = { ...input, id: crypto.randomUUID() };
      posts = [...posts, post];
      return post;
    },
    listFeed: async ({ after, limit }) =>
      posts
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .filter((post) => after === undefined || post.createdAt < after.createdAt)
        .slice(0, limit)
        .map((post) => ({
          author: { id: post.authorId, name: post.authorId },
          likeCount: 0,
          likedByMe: false,
          post,
        })),
    posts: () => posts,
    setLike: async ({ liked, postId, userId }) => {
      const key = likeKey(postId, userId);
      likes = liked ? [...new Set([...likes, key])] : likes.filter((item) => item !== key);
    },
  };
};
