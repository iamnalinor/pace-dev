import { Elysia, t } from "elysia";

import type { AuthMacro } from "../../../auth/auth-plugin.ts";
import type { makeCreateExamplePost } from "../application/create-example-post.ts";
import type { makeDeleteExamplePost } from "../application/delete-example-post.ts";
import type { ExampleFeedItem } from "../application/example-post-repository.ts";
import type { makeListExampleFeed } from "../application/list-example-feed.ts";

import { HttpErrorSchema } from "../../../shared/http-error.ts";
import { examplePostProblem } from "./example-post-errors.ts";
import {
  CreateExamplePostBody,
  EXAMPLE_FEED_DEFAULT_LIMIT,
  ExampleFeedItemSchema,
  ExampleFeedPageSchema,
  ExampleFeedQuery,
  ExamplePostIdParams,
} from "./example-post-schemas.ts";

const toFeedItemDto = ({ author, likeCount, likedByMe, post }: ExampleFeedItem) => ({
  author,
  body: post.body,
  createdAt: post.createdAt.toISOString(),
  id: post.id,
  likeCount,
  likedByMe,
});

// Factories, not shared constants: Elysia mutates a route's options object (it
// stores resolved macro hooks on it), so sharing one object between app instances
// makes the second app run the first app's hooks.
const listRouteOptions = () =>
  ({
    auth: true,
    query: ExampleFeedQuery,
    response: { 200: ExampleFeedPageSchema, 400: HttpErrorSchema, 401: HttpErrorSchema },
  }) as const;

const creationRouteOptions = () =>
  ({
    auth: true,
    body: CreateExamplePostBody,
    response: { 201: ExampleFeedItemSchema, 401: HttpErrorSchema, 422: HttpErrorSchema },
  }) as const;

const deletionRouteOptions = () =>
  ({
    auth: true,
    params: ExamplePostIdParams,
    response: {
      204: t.Undefined(),
      401: HttpErrorSchema,
      403: HttpErrorSchema,
      404: HttpErrorSchema,
    },
  }) as const;

export const createExamplePostRoutes = (deps: {
  readonly authMacro: AuthMacro;
  readonly createPost: ReturnType<typeof makeCreateExamplePost>;
  readonly deletePost: ReturnType<typeof makeDeleteExamplePost>;
  readonly listFeed: ReturnType<typeof makeListExampleFeed>;
}) =>
  new Elysia({ prefix: "/example-posts" })
    .use(deps.authMacro)
    .get(
      "/",
      async ({ query, status, user }) => {
        const page = await deps.listFeed({
          cursor: query.cursor,
          limit: query.limit ?? EXAMPLE_FEED_DEFAULT_LIMIT,
          viewer: user,
        });
        if (!page.ok) {
          return status(400, { code: page.error, message: "Invalid cursor" });
        }
        return {
          items: page.value.items.map((item) => toFeedItemDto(item)),
          nextCursor: page.value.nextCursor ?? null,
        };
      },
      listRouteOptions(),
    )
    .post(
      "/",
      async ({ body, status, user }) => {
        const created = await deps.createPost({ author: user, body: body.body });
        return created.ok
          ? status(201, toFeedItemDto(created.value))
          : status(422, examplePostProblem(created.error));
      },
      creationRouteOptions(),
    )
    .delete(
      "/:id",
      async ({ params, status, user }) => {
        const deleted = await deps.deletePost({ postId: params.id, user });
        if (deleted.ok) {
          return status(204, undefined);
        }
        switch (deleted.error) {
          case "example-post/forbidden": {
            return status(403, examplePostProblem(deleted.error));
          }
          case "example-post/not-found": {
            return status(404, examplePostProblem(deleted.error));
          }
        }
      },
      deletionRouteOptions(),
    );
