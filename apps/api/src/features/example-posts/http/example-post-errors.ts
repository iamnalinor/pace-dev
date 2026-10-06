import type { DeleteExamplePostError } from "../application/delete-example-post.ts";
import type { ExamplePostBodyError } from "../domain/example-post.ts";

type ExamplePostErrorCode = DeleteExamplePostError | ExamplePostBodyError;

// A Record over the union: adding an error code without a message is a type error.
const MESSAGES: Readonly<Record<ExamplePostErrorCode, string>> = {
  "example-post/empty": "Post must not be empty",
  "example-post/forbidden": "Only the author can delete this post",
  "example-post/not-found": "Post not found",
  "example-post/too-long": "Post is too long",
};

/** Response body for a domain error: stable `code` for clients, message for humans. */
export const examplePostProblem = <Code extends ExamplePostErrorCode>(code: Code) => ({
  code,
  message: MESSAGES[code],
});
