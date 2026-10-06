/**
 * The API's public, TYPE-ONLY contract for clients (the web app imports it with
 * `import type`; dependency-cruiser forbids runtime imports from apps/web).
 */
import type { EXAMPLE_POST_MAX_LENGTH } from "./features/example-posts/domain/example-post.ts";

export type { App } from "./app.ts";

/** The literal type `500`: lets the client assert at compile time that its limit matches. */
export type ExamplePostMaxLength = typeof EXAMPLE_POST_MAX_LENGTH;
