import { Elysia } from "elysia";

import type { AuthMacro } from "../../auth/auth-plugin.ts";
import type { Clock } from "../../shared/clock.ts";
import type { Database } from "../../shared/db/client.ts";

import { makeCreateExamplePost } from "./application/create-example-post.ts";
import { makeDeleteExamplePost } from "./application/delete-example-post.ts";
import { makeListExampleFeed } from "./application/list-example-feed.ts";
import { makeSetExampleLike } from "./application/set-example-like.ts";
import { createExampleLikeRoutes } from "./http/example-like-routes.ts";
import { createExamplePostRoutes } from "./http/example-post-routes.ts";
import { createDrizzleExamplePostRepository } from "./infrastructure/drizzle-example-post-repository.ts";

/** Composition root of the feature: the only file that knows every layer. */
export const createExamplePostsFeature = (deps: {
  readonly authMacro: AuthMacro;
  readonly clock: Clock;
  readonly db: Database;
}) => {
  const repository = createDrizzleExamplePostRepository(deps.db);
  return new Elysia()
    .use(
      createExamplePostRoutes({
        authMacro: deps.authMacro,
        createPost: makeCreateExamplePost({ clock: deps.clock, repository }),
        deletePost: makeDeleteExamplePost({ repository }),
        listFeed: makeListExampleFeed({ repository }),
      }),
    )
    .use(
      createExampleLikeRoutes({
        authMacro: deps.authMacro,
        setLike: makeSetExampleLike({ repository }),
      }),
    );
};
