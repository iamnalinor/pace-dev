import type { CurrentUser } from "../../../auth/current-user.ts";
import type { ExampleLikeState, ExamplePostRepository } from "./example-post-repository.ts";

import { err, ok, type Result } from "../../../shared/result.ts";

export type SetExampleLikeError = "example-post/not-found";

/** Idempotent: liking twice (or unliking a post you never liked) is not an error. */
export const makeSetExampleLike =
  (deps: { readonly repository: ExamplePostRepository }) =>
  async (input: {
    readonly liked: boolean;
    readonly postId: string;
    readonly user: CurrentUser;
  }): Promise<Result<ExampleLikeState, SetExampleLikeError>> => {
    const post = await deps.repository.findById(input.postId);
    if (post === undefined) {
      return err("example-post/not-found");
    }
    await deps.repository.setLike({
      liked: input.liked,
      postId: post.id,
      userId: input.user.id,
    });
    return ok(await deps.repository.getLikeState(post.id, input.user.id));
  };
