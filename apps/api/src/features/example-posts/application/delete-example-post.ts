import type { CurrentUser } from "../../../auth/current-user.ts";
import type { ExamplePostRepository } from "./example-post-repository.ts";

import { err, ok, type Result } from "../../../shared/result.ts";
import { isExamplePostAuthor } from "../domain/example-post.ts";

export type DeleteExamplePostError = "example-post/forbidden" | "example-post/not-found";

export const makeDeleteExamplePost =
  (deps: { readonly repository: ExamplePostRepository }) =>
  async (input: {
    readonly postId: string;
    readonly user: CurrentUser;
  }): Promise<Result<undefined, DeleteExamplePostError>> => {
    const post = await deps.repository.findById(input.postId);
    if (post === undefined) {
      return err("example-post/not-found");
    }
    if (!isExamplePostAuthor(post, input.user.id)) {
      return err("example-post/forbidden");
    }
    await deps.repository.delete(post.id);
    return ok(undefined);
  };
