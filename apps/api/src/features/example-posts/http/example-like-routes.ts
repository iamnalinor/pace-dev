import { Elysia } from "elysia";

import type { AuthMacro } from "../../../auth/auth-plugin.ts";
import type { makeSetExampleLike } from "../application/set-example-like.ts";

import { HttpErrorSchema } from "../../../shared/http-error.ts";
import { examplePostProblem } from "./example-post-errors.ts";
import { ExampleLikeStateSchema, ExamplePostIdParams } from "./example-post-schemas.ts";

// A factory, not a shared constant: Elysia mutates route options (see example-post-routes.ts).
const likeRouteOptions = () =>
  ({
    auth: true,
    params: ExamplePostIdParams,
    response: { 200: ExampleLikeStateSchema, 401: HttpErrorSchema, 404: HttpErrorSchema },
  }) as const;

/** PUT = like, DELETE = unlike. Both idempotent and both return the resulting state. */
export const createExampleLikeRoutes = (deps: {
  readonly authMacro: AuthMacro;
  readonly setLike: ReturnType<typeof makeSetExampleLike>;
}) =>
  new Elysia({ prefix: "/example-posts" })
    .use(deps.authMacro)
    .put(
      "/:id/like",
      async ({ params, status, user }) => {
        const state = await deps.setLike({ liked: true, postId: params.id, user });
        return state.ok ? state.value : status(404, examplePostProblem(state.error));
      },
      likeRouteOptions(),
    )
    .delete(
      "/:id/like",
      async ({ params, status, user }) => {
        const state = await deps.setLike({ liked: false, postId: params.id, user });
        return state.ok ? state.value : status(404, examplePostProblem(state.error));
      },
      likeRouteOptions(),
    );
