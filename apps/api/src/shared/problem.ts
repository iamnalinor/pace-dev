import type { ContentfulStatusCode } from "hono/utils/http-status";

/** A failure the handler chose: becomes `{ code, message }` with this status. */
export type Problem = {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly message: string;
};
