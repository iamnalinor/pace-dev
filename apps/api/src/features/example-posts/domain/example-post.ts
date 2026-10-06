import { err, ok, type Result } from "../../../shared/result.ts";

/**
 * Maximum post length in Unicode code points — the unit PostgreSQL `char_length`
 * counts, so the domain rule, the DB check constraint and the web counter agree.
 * (Not UTF-16 units: "😀".length === 2, but it is one code point.)
 */
export const EXAMPLE_POST_MAX_LENGTH = 500;

export type ExamplePost = {
  readonly authorId: string;
  readonly body: ExamplePostBody;
  readonly createdAt: Date;
  readonly id: string;
};

/** A body that passed validation. The brand makes "validated" visible in types. */
export type ExamplePostBody = string & { readonly __brand: "ExamplePostBody" };

export type ExamplePostBodyError = "example-post/empty" | "example-post/too-long";

// Array.from iterates by code point — exactly the unit we want here (see above).
export const countCodePoints = (text: string): number =>
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- splitting by code point is the intent (see EXAMPLE_POST_MAX_LENGTH)
  [...text].length;

/**
 * Normalizes (NFC, trimmed) and validates a post body.
 * NFC first: "é" typed as e + U+0301 must count as one character, like the precomposed "é".
 */
export const parseExamplePostBody = (
  raw: string,
): Result<ExamplePostBody, ExamplePostBodyError> => {
  const body = raw.normalize("NFC").trim();
  if (body.length === 0) {
    return err("example-post/empty");
  }
  return countCodePoints(body) > EXAMPLE_POST_MAX_LENGTH
    ? err("example-post/too-long")
    : ok(body as ExamplePostBody);
};

export const isExamplePostAuthor = (post: ExamplePost, userId: string): boolean =>
  post.authorId === userId;
