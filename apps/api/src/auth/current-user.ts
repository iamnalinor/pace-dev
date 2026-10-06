/** What the application layer knows about the signed-in user. Independent of better-auth. */
export type CurrentUser = {
  readonly email: string;
  readonly id: string;
  readonly name: string;
};
