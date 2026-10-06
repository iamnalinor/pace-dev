import { describe, expect, test } from "bun:test";

import type { ExamplePost, ExamplePostBody } from "../domain/example-post.ts";

import { encodeExampleFeedCursor } from "../domain/example-feed-cursor.ts";
import { createFakeExamplePostRepository } from "./example-post-repository.fake.ts";
import { makeListExampleFeed } from "./list-example-feed.ts";

const viewer = { email: "viewer@mail.test", id: "viewer", name: "Viewer" };
const postAt = (minute: number): ExamplePost => ({
  authorId: "author",
  body: `post ${minute}` as ExamplePostBody,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
  id: `00000000-0000-4000-8000-${String(minute).padStart(12, "0")}`,
});

describe("listExampleFeed", () => {
  const listFeed = makeListExampleFeed({
    repository: createFakeExamplePostRepository([postAt(1), postAt(2), postAt(3)]),
  });

  test("returns a cursor pointing at the last item when more items exist", async () => {
    const page = await listFeed({ cursor: undefined, limit: 2, viewer });

    expect(page.ok && page.value.items.map((item) => item.post.id)).toEqual([
      postAt(3).id,
      postAt(2).id,
    ]);
    expect(page.ok && page.value.nextCursor).toBe(encodeExampleFeedCursor(postAt(2)));
  });

  test("last page has no cursor, even when it is exactly full", async () => {
    const first = await listFeed({ cursor: undefined, limit: 2, viewer });
    const cursor = first.ok ? first.value.nextCursor : undefined;
    const last = await listFeed({ cursor, limit: 1, viewer });

    expect(last.ok && last.value.items.map((item) => item.post.id)).toEqual([postAt(1).id]);
    expect(last.ok && last.value.nextCursor).toBeUndefined();
  });

  test("rejects a malformed cursor instead of silently restarting from the top", async () => {
    expect(await listFeed({ cursor: "garbage", limit: 2, viewer })).toEqual({
      error: "example-feed/invalid-cursor",
      ok: false,
    });
  });
});
