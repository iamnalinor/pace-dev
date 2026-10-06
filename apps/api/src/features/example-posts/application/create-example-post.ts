import type { CurrentUser } from "../../../auth/current-user.ts";
import type { Clock } from "../../../shared/clock.ts";
import type { ExampleFeedItem, ExamplePostRepository } from "./example-post-repository.ts";

import { ok, type Result } from "../../../shared/result.ts";
import { type ExamplePostBodyError, parseExamplePostBody } from "../domain/example-post.ts";

export const makeCreateExamplePost =
  (deps: { readonly clock: Clock; readonly repository: ExamplePostRepository }) =>
  async (input: {
    readonly author: CurrentUser;
    readonly body: string;
  }): Promise<Result<ExampleFeedItem, ExamplePostBodyError>> => {
    const body = parseExamplePostBody(input.body);
    if (!body.ok) {
      return body;
    }
    const post = await deps.repository.insert({
      authorId: input.author.id,
      body: body.value,
      createdAt: deps.clock.now(),
    });
    return ok({
      author: { id: input.author.id, name: input.author.name },
      likeCount: 0,
      likedByMe: false,
      post,
    });
  };
