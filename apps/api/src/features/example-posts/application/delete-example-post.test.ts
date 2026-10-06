import { describe, expect, test } from "bun:test";

import type { ExamplePost, ExamplePostBody } from "../domain/example-post.ts";

import { makeDeleteExamplePost } from "./delete-example-post.ts";
import { createFakeExamplePostRepository } from "./example-post-repository.fake.ts";

const author = { email: "author@mail.test", id: "author", name: "Author" };
const stranger = { email: "stranger@mail.test", id: "stranger", name: "Stranger" };
const post: ExamplePost = {
  authorId: author.id,
  body: "hello" as ExamplePostBody,
  createdAt: new Date(0),
  id: "post-1",
};

describe("deleteExamplePost", () => {
  test("only the author can delete a post", async () => {
    const repository = createFakeExamplePostRepository([post]);
    const deletePost = makeDeleteExamplePost({ repository });

    expect(await deletePost({ postId: post.id, user: stranger })).toEqual({
      error: "example-post/forbidden",
      ok: false,
    });
    expect(repository.posts()).toHaveLength(1);

    expect(await deletePost({ postId: post.id, user: author })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(repository.posts()).toHaveLength(0);
  });

  test("missing post is not-found, not forbidden (no existence leak via 403)", async () => {
    const deletePost = makeDeleteExamplePost({ repository: createFakeExamplePostRepository() });

    expect(await deletePost({ postId: "missing", user: stranger })).toEqual({
      error: "example-post/not-found",
      ok: false,
    });
  });
});
