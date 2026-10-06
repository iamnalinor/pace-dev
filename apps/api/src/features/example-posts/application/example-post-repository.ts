import type { ExampleFeedCursor } from "../domain/example-feed-cursor.ts";
import type { ExamplePost, ExamplePostBody } from "../domain/example-post.ts";

/** Read model for the feed: a post plus what the viewer needs to render it. */
export type ExampleFeedItem = {
  readonly author: { readonly id: string; readonly name: string };
  readonly likeCount: number;
  readonly likedByMe: boolean;
  readonly post: ExamplePost;
};

export type ExampleLikeState = { readonly likeCount: number; readonly likedByMe: boolean };

/**
 * Port: what the use cases need from storage. Implemented by infrastructure
 * (Drizzle) and by in-memory fakes in unit tests.
 */
export type ExamplePostRepository = {
  readonly delete: (postId: string) => Promise<void>;
  readonly findById: (postId: string) => Promise<ExamplePost | undefined>;
  readonly getLikeState: (postId: string, userId: string) => Promise<ExampleLikeState>;
  readonly insert: (post: {
    readonly authorId: string;
    readonly body: ExamplePostBody;
    readonly createdAt: Date;
  }) => Promise<ExamplePost>;
  /** Newest first, strictly after `after` when given. Must be idempotent-safe under races. */
  readonly listFeed: (query: {
    readonly after: ExampleFeedCursor | undefined;
    readonly limit: number;
    readonly viewerId: string;
  }) => Promise<readonly ExampleFeedItem[]>;
  /** Idempotent. Does nothing if the post does not exist (checked separately). */
  readonly setLike: (like: {
    readonly liked: boolean;
    readonly postId: string;
    readonly userId: string;
  }) => Promise<void>;
};
