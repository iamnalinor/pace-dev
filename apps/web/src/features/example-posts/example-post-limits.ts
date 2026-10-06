import type { ExamplePostMaxLength } from "@template/api";

/**
 * Mirrors the API's limit. The annotation makes it a compile error if the two ever
 * disagree; the server still validates (the client counter is only UX).
 */
export const EXAMPLE_POST_MAX_LENGTH: ExamplePostMaxLength = 500;

/** Same unit as the API and PostgreSQL `char_length`: Unicode code points. */
export const countCodePoints = (text: string): number =>
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- splitting by code point is the intent
  [...text.normalize("NFC").trim()].length;
