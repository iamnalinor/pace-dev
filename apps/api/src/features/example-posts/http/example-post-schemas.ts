import { t } from "elysia";

import { EXAMPLE_POST_MAX_LENGTH } from "../domain/example-post.ts";

export const EXAMPLE_FEED_DEFAULT_LIMIT = 20;
export const EXAMPLE_FEED_MAX_LIMIT = 50;

export const ExamplePostIdParams = t.Object({ id: t.String({ format: "uuid" }) });

export const CreateExamplePostBody = t.Object({
  // Coarse transport guard only (UTF-16 units: an emoji is 2). The exact rule —
  // trimmed, NFC, code points — lives in the domain (parseExamplePostBody).
  body: t.String({ maxLength: EXAMPLE_POST_MAX_LENGTH * 2 }),
});

export const ExampleFeedQuery = t.Object({
  cursor: t.Optional(t.String({ maxLength: 200 })),
  limit: t.Optional(t.Integer({ maximum: EXAMPLE_FEED_MAX_LIMIT, minimum: 1 })),
});

export const ExampleFeedItemSchema = t.Object({
  author: t.Object({ id: t.String(), name: t.String() }),
  body: t.String(),
  createdAt: t.String({ format: "date-time" }),
  id: t.String({ format: "uuid" }),
  likeCount: t.Integer({ minimum: 0 }),
  likedByMe: t.Boolean(),
});

export const ExampleFeedPageSchema = t.Object({
  items: t.Array(ExampleFeedItemSchema),
  nextCursor: t.Nullable(t.String()),
});

export const ExampleLikeStateSchema = t.Object({
  likeCount: t.Integer({ minimum: 0 }),
  likedByMe: t.Boolean(),
});
