import type { CurrentUser } from "../../../auth/current-user.ts";
import type { ExampleFeedItem, ExamplePostRepository } from "./example-post-repository.ts";

import { ok, type Result } from "../../../shared/result.ts";
import {
  decodeExampleFeedCursor,
  encodeExampleFeedCursor,
  type ExampleFeedCursor,
  type ExampleFeedCursorError,
} from "../domain/example-feed-cursor.ts";

export type ExampleFeedPage = {
  readonly items: readonly ExampleFeedItem[];
  readonly nextCursor: string | undefined;
};

const decodeOptionalCursor = (
  text: string | undefined,
): Result<ExampleFeedCursor | undefined, ExampleFeedCursorError> =>
  text === undefined ? ok(undefined) : decodeExampleFeedCursor(text);

export const makeListExampleFeed =
  (deps: { readonly repository: ExamplePostRepository }) =>
  async (input: {
    readonly cursor: string | undefined;
    readonly limit: number;
    readonly viewer: CurrentUser;
  }): Promise<Result<ExampleFeedPage, ExampleFeedCursorError>> => {
    const after = decodeOptionalCursor(input.cursor);
    if (!after.ok) {
      return after;
    }
    // Fetch one extra row: its presence (not a COUNT query) tells whether another page exists.
    const rows = await deps.repository.listFeed({
      after: after.value,
      limit: input.limit + 1,
      viewerId: input.viewer.id,
    });
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    const hasMore = rows.length > input.limit;
    return ok({
      items,
      nextCursor: hasMore && last !== undefined ? encodeExampleFeedCursor(last.post) : undefined,
    });
  };
